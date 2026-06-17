import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { OrderStatus, PaymentStatus } from '../../../generated/prisma/enums';
import { ensureSeller } from '../../common/helpers/role-check.helper';
import { PrismaService } from '../../prisma/prisma.service';
import { SellerAnalyticsQueryDto } from './dto/seller-analytics-query.dto';

type ProductPerformanceRow = {
  productId: string;
  unitsSold: number;
  orderLines: number;
  revenue: number;
};

@Injectable()
export class SellerService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(sellerId: string, query: SellerAnalyticsQueryDto) {
    await ensureSeller(this.prisma, sellerId);

    const dateFilter = this.buildDateFilter(query);
    const orderWhere: Prisma.OrderWhereInput = {
      sellerId,
      ...dateFilter,
    };

    const [
      totalSales,
      revenue,
      orderCountsByStatus,
      productPerformanceResponse,
      payoutSummary,
      productsCount,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          ...orderWhere,
          status: {
            in: [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED],
          },
        },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.getRevenueSummary(sellerId, dateFilter),
      this.getOrderCountsByStatus(sellerId, dateFilter),
      this.getProductsPerformance(sellerId, query),
      this.getPayoutSummary(sellerId, dateFilter),
      this.prisma.product.count({ where: { sellerId } }),
    ]);

    return {
      message: 'Seller dashboard retrieved',
      data: {
        totalSales: totalSales._count._all,
        totalSalesValue: this.toNumber(totalSales._sum.total),
        revenue,
        orderCountsByStatus,
        productPerformance: productPerformanceResponse.data,
        payoutSummary,
        productsCount,
      },
    };
  }

  async getAnalytics(sellerId: string, query: SellerAnalyticsQueryDto) {
    await ensureSeller(this.prisma, sellerId);

    const dateFilter = this.buildDateFilter(query);
    const [orders, revenue, payouts] = await Promise.all([
      this.prisma.order.aggregate({
        where: { sellerId, ...dateFilter },
        _count: { _all: true },
        _sum: {
          subtotal: true,
          shippingFee: true,
          tax: true,
          discount: true,
          total: true,
        },
        _avg: { total: true },
      }),
      this.getRevenueSummary(sellerId, dateFilter),
      this.getPayoutSummary(sellerId, dateFilter),
    ]);

    return {
      message: 'Seller analytics retrieved',
      data: {
        orders: {
          count: orders._count._all,
          subtotal: this.toNumber(orders._sum.subtotal),
          shippingFee: this.toNumber(orders._sum.shippingFee),
          tax: this.toNumber(orders._sum.tax),
          discount: this.toNumber(orders._sum.discount),
          total: this.toNumber(orders._sum.total),
          averageOrderValue: this.toNumber(orders._avg.total),
        },
        revenue,
        payouts,
      },
    };
  }

  async getProductsPerformance(
    sellerId: string,
    query: SellerAnalyticsQueryDto,
  ) {
    await ensureSeller(this.prisma, sellerId);

    const dateFilter = this.buildDateFilter(query);
    const limit = query.limit ?? 10;
    const groupedItems = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          sellerId,
          ...dateFilter,
        },
      },
      _sum: { quantity: true },
      _count: { _all: true },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: limit,
    });

    if (!groupedItems.length) {
      return {
        message: 'Product performance retrieved',
        data: [],
      };
    }

    const productIds = groupedItems.map((item) => item.productId);
    const [products, orderItems] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds }, sellerId },
        select: {
          id: true,
          title: true,
          slug: true,
          price: true,
          stock: true,
          status: true,
          viewCount: true,
          images: {
            where: { isPrimary: true },
            take: 1,
            select: { url: true, alt: true },
          },
        },
      }),
      this.prisma.orderItem.findMany({
        where: {
          productId: { in: productIds },
          order: {
            sellerId,
            ...dateFilter,
          },
        },
        select: {
          productId: true,
          price: true,
          quantity: true,
        },
      }),
    ]);

    const revenueByProduct = orderItems.reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.productId] =
          (acc[item.productId] ?? 0) +
          this.toNumber(item.price) * item.quantity;
        return acc;
      },
      {},
    );
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    const performance: ProductPerformanceRow[] = groupedItems.map((item) => ({
      productId: item.productId,
      unitsSold: item._sum.quantity ?? 0,
      orderLines: item._count._all,
      revenue: revenueByProduct[item.productId] ?? 0,
    }));

    return {
      message: 'Product performance retrieved',
      data: performance.map((item) => ({
        ...item,
        product: productById.get(item.productId) ?? null,
      })),
    };
  }

  private async getOrderCountsByStatus(
    sellerId: string,
    dateFilter: Prisma.OrderWhereInput,
  ) {
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      where: { sellerId, ...dateFilter },
      _count: { _all: true },
    });

    return rows.reduce<Record<OrderStatus, number>>(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {
        PENDING: 0,
        CONFIRMED: 0,
        PAID: 0,
        SHIPPED: 0,
        DELIVERED: 0,
        CANCELLED: 0,
        REFUNDED: 0,
      },
    );
  }

  private async getRevenueSummary(
    sellerId: string,
    dateFilter: Prisma.OrderWhereInput,
  ) {
    const [paidOrders, completedPayments] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          sellerId,
          status: {
            in: [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED],
          },
          ...dateFilter,
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.COMPLETED,
          order: {
            sellerId,
            ...dateFilter,
          },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      paidOrderCount: paidOrders._count._all,
      paidOrderTotal: this.toNumber(paidOrders._sum.total),
      completedPaymentCount: completedPayments._count._all,
      completedPaymentTotal: this.toNumber(completedPayments._sum.amount),
    };
  }

  private async getPayoutSummary(
    sellerId: string,
    dateFilter: Prisma.OrderWhereInput,
  ) {
    const payoutCreatedAt = this.buildPayoutCreatedAtFilter(dateFilter);
    const rows = await this.prisma.payout.groupBy({
      by: ['status'],
      where: { sellerId, ...payoutCreatedAt },
      _sum: { amount: true },
      _count: { id: true },
    });

    return rows.map((row) => ({
      status: row.status,
      count: row._count.id,
      amount: this.toNumber(row._sum.amount),
    }));
  }

  private buildDateFilter(
    query: SellerAnalyticsQueryDto,
  ): Prisma.OrderWhereInput {
    if (!query.from && !query.to) {
      return {};
    }

    return {
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    };
  }

  private buildPayoutCreatedAtFilter(
    dateFilter: Prisma.OrderWhereInput,
  ): Prisma.PayoutWhereInput {
    if (!dateFilter.createdAt || typeof dateFilter.createdAt !== 'object') {
      return {};
    }

    const createdAt = dateFilter.createdAt as {
      gte?: Date;
      lte?: Date;
    };

    return {
      createdAt: {
        ...(createdAt.gte ? { gte: createdAt.gte } : {}),
        ...(createdAt.lte ? { lte: createdAt.lte } : {}),
      },
    };
  }

  private toNumber(value: Prisma.Decimal | number | null | undefined) {
    return value === null || value === undefined ? 0 : Number(value);
  }
}
