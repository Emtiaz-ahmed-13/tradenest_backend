import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  OrderStatus,
  PaymentStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import { ensureAdmin } from '../../common/helpers/role-check.helper';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(adminId: string, query: AnalyticsQueryDto) {
    await ensureAdmin(this.prisma, adminId);

    const dateFilter = this.buildDateFilter(query);
    const [gmv, users, orders, revenueByPeriod] = await Promise.all([
      this.getGmvData(dateFilter),
      this.getUserGrowthData(query),
      this.getOrderStatsData(dateFilter),
      this.getRevenueByPeriod(dateFilter, query.period ?? 'day'),
    ]);

    return {
      message: 'Analytics overview retrieved',
      data: {
        gmv,
        users,
        orders,
        revenueByPeriod,
      },
    };
  }

  async getGmv(adminId: string, query: AnalyticsQueryDto) {
    await ensureAdmin(this.prisma, adminId);

    const data = await this.getGmvData(this.buildDateFilter(query));

    return { message: 'GMV analytics retrieved', data };
  }

  async getUsers(adminId: string, query: AnalyticsQueryDto) {
    await ensureAdmin(this.prisma, adminId);

    const data = await this.getUserGrowthData(query);

    return { message: 'User analytics retrieved', data };
  }

  private async getGmvData(dateFilter: Prisma.OrderWhereInput) {
    const [allOrders, paidOrders, completedPayments] = await Promise.all([
      this.prisma.order.aggregate({
        where: dateFilter,
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: {
          ...dateFilter,
          status: {
            in: [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED],
          },
        },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: PaymentStatus.COMPLETED,
          order: dateFilter,
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    return {
      orderCount: allOrders._count._all,
      grossMerchandiseValue: this.toNumber(allOrders._sum.total),
      paidOrderCount: paidOrders._count._all,
      paidOrderValue: this.toNumber(paidOrders._sum.total),
      completedPaymentCount: completedPayments._count._all,
      completedPaymentValue: this.toNumber(completedPayments._sum.amount),
    };
  }

  private async getOrderStatsData(dateFilter: Prisma.OrderWhereInput) {
    const [summary, byStatus] = await Promise.all([
      this.prisma.order.aggregate({
        where: dateFilter,
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
      this.prisma.order.groupBy({
        by: ['status'],
        where: dateFilter,
        _count: { _all: true },
        _sum: { total: true },
      }),
    ]);

    return {
      count: summary._count._all,
      subtotal: this.toNumber(summary._sum.subtotal),
      shippingFee: this.toNumber(summary._sum.shippingFee),
      tax: this.toNumber(summary._sum.tax),
      discount: this.toNumber(summary._sum.discount),
      total: this.toNumber(summary._sum.total),
      averageOrderValue: this.toNumber(summary._avg.total),
      byStatus: byStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
        total: this.toNumber(row._sum.total),
      })),
    };
  }

  private async getUserGrowthData(query: AnalyticsQueryDto) {
    const userWhere = this.buildUserDateFilter(query);
    const period = query.period ?? 'day';
    const [totalUsers, newUsers, usersByRole, users] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: userWhere }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: userWhere,
        _count: { role: true },
      }),
      this.prisma.user.findMany({
        where: userWhere,
        select: { id: true, role: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      totalUsers,
      newUsers,
      byRole: this.normalizeRoleCounts(usersByRole),
      growth: this.bucketUsers(users, period),
    };
  }

  private async getRevenueByPeriod(
    dateFilter: Prisma.OrderWhereInput,
    period: 'day' | 'month',
  ) {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.COMPLETED,
        order: dateFilter,
      },
      select: {
        amount: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const buckets = payments.reduce<
      Record<string, { revenue: number; count: number }>
    >((acc, payment) => {
      const key = this.formatPeriodKey(
        payment.paidAt ?? payment.createdAt,
        period,
      );
      const current = acc[key] ?? { revenue: 0, count: 0 };
      current.revenue += this.toNumber(payment.amount);
      current.count += 1;
      acc[key] = current;
      return acc;
    }, {});

    return Object.entries(buckets).map(([periodKey, value]) => ({
      period: periodKey,
      revenue: value.revenue,
      paymentCount: value.count,
    }));
  }

  private normalizeRoleCounts(
    rows: Array<{ role: UserRole; _count: { role: number } }>,
  ) {
    return rows.reduce<Record<UserRole, number>>(
      (acc, row) => {
        acc[row.role] = row._count.role;
        return acc;
      },
      {
        BUYER: 0,
        SELLER: 0,
        ADMIN: 0,
        MODERATOR: 0,
      },
    );
  }

  private bucketUsers(
    users: Array<{ role: UserRole; createdAt: Date }>,
    period: 'day' | 'month',
  ) {
    const buckets = users.reduce<
      Record<string, { total: number; roles: Record<UserRole, number> }>
    >((acc, user) => {
      const key = this.formatPeriodKey(user.createdAt, period);
      const current = acc[key] ?? {
        total: 0,
        roles: {
          BUYER: 0,
          SELLER: 0,
          ADMIN: 0,
          MODERATOR: 0,
        },
      };

      current.total += 1;
      current.roles[user.role] += 1;
      acc[key] = current;

      return acc;
    }, {});

    return Object.entries(buckets).map(([periodKey, value]) => ({
      period: periodKey,
      total: value.total,
      roles: value.roles,
    }));
  }

  private buildDateFilter(query: AnalyticsQueryDto): Prisma.OrderWhereInput {
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

  private buildUserDateFilter(query: AnalyticsQueryDto): Prisma.UserWhereInput {
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

  private formatPeriodKey(date: Date, period: 'day' | 'month') {
    const iso = date.toISOString();
    return period === 'month' ? iso.slice(0, 7) : iso.slice(0, 10);
  }

  private toNumber(value: Prisma.Decimal | number | null | undefined) {
    return value === null || value === undefined ? 0 : Number(value);
  }
}
