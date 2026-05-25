import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  OrderStatus,
  ProductStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

type CartLine = {
  cartItemId: string;
  productId: string;
  sellerId: string;
  title: string;
  price: number;
  quantity: number;
  stock: number;
  currency: string;
};

@Injectable()
export class OrdersService {
  private readonly orderInclude: Prisma.OrderInclude = {
    items: {
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            images: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
    },
    shippingAddress: true,
    buyer: {
      select: { id: true, name: true, email: true, phone: true },
    },
    seller: {
      select: {
        id: true,
        name: true,
        sellerProfile: { select: { shopName: true, slug: true } },
      },
    },
    payment: true,
  };

  constructor(private readonly prisma: PrismaService) {}

  async placeFromCart(buyerId: string, dto: PlaceOrderDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId: buyerId },
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    if (!cart?.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const lines = this.validateCartLines(cart.items);
    const shippingAddress = await this.resolveShippingAddress(
      buyerId,
      dto.shippingAddressId,
    );

    const grouped = this.groupLinesBySeller(lines);
    const orders = await this.prisma.$transaction(async (tx) => {
      const createdOrders: Awaited<ReturnType<typeof tx.order.create>>[] = [];

      for (const [, sellerLines] of grouped) {
        const subtotal = sellerLines.reduce(
          (sum, line) => sum + line.price * line.quantity,
          0,
        );
        const shippingFee = 0;
        const tax = 0;
        const total = subtotal + shippingFee + tax;

        const order = await tx.order.create({
          data: {
            orderNumber: await this.generateOrderNumber(tx),
            buyerId,
            sellerId: sellerLines[0].sellerId,
            shippingAddressId: shippingAddress.id,
            status: OrderStatus.PENDING,
            subtotal,
            shippingFee,
            tax,
            total,
            currency: sellerLines[0].currency,
            notes: dto.notes,
            items: {
              create: sellerLines.map((line) => ({
                productId: line.productId,
                title: line.title,
                price: line.price,
                quantity: line.quantity,
              })),
            },
          },
          include: this.orderInclude,
        });

        for (const line of sellerLines) {
          const updated = await tx.product.updateMany({
            where: {
              id: line.productId,
              stock: { gte: line.quantity },
              status: ProductStatus.ACTIVE,
            },
            data: {
              stock: { decrement: line.quantity },
            },
          });

          if (updated.count !== 1) {
            throw new BadRequestException(
              `Insufficient stock for ${line.title}`,
            );
          }
        }

        createdOrders.push(order);
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return createdOrders;
    });

    return {
      message: 'Order placed successfully',
      data: orders,
    };
  }

  async findBuyerOrders(buyerId: string, query: ListOrdersQueryDto) {
    return this.listOrders({ buyerId }, query, 'Buyer orders retrieved');
  }

  async findSellerOrders(sellerId: string, query: ListOrdersQueryDto) {
    await this.ensureSellerOrAdmin(sellerId);

    return this.listOrders({ sellerId }, query, 'Seller orders retrieved');
  }

  async findOne(userId: string, orderId: string) {
    const role = await this.getUserRole(userId);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.orderInclude,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      role !== UserRole.ADMIN &&
      order.buyerId !== userId &&
      order.sellerId !== userId
    ) {
      throw new ForbiddenException('You cannot access this order');
    }

    return {
      message: 'Order retrieved',
      data: order,
    };
  }

  async generateInvoice(userId: string, orderId: string) {
    const role = await this.getUserRole(userId);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.orderInclude,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      role !== UserRole.ADMIN &&
      order.buyerId !== userId &&
      order.sellerId !== userId
    ) {
      throw new ForbiddenException('You cannot access this invoice');
    }

    return {
      message: 'Invoice generated',
      data: {
        invoiceNumber: `INV-${order.orderNumber}`,
        issuedAt: new Date().toISOString(),
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        paymentStatus: order.payment?.status ?? 'UNPAID',
        buyer: order.buyer,
        seller: order.seller,
        shippingAddress: order.shippingAddress,
        currency: order.currency,
        items: order.items.map((item) => ({
          title: item.title,
          quantity: item.quantity,
          unitPrice: Number(item.price),
          lineTotal: Number(item.price) * item.quantity,
        })),
        totals: {
          subtotal: Number(order.subtotal),
          shippingFee: Number(order.shippingFee),
          tax: Number(order.tax),
          total: Number(order.total),
        },
      },
    };
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.getAccessibleOrder(userId, orderId);

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.CONFIRMED
    ) {
      throw new BadRequestException('Order cannot be cancelled at this stage');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
        },
        include: this.orderInclude,
      });
    });

    return {
      message: 'Order cancelled',
      data: updated,
    };
  }

  async updateStatus(
    userId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ) {
    const role = await this.getUserRole(userId);
    const order = await this.getAccessibleOrder(userId, orderId);

    if (role !== UserRole.ADMIN && order.sellerId !== userId) {
      throw new ForbiddenException('Only the seller can update order status');
    }

    this.assertValidStatusTransition(order.status, dto.status);

    const timestamps = this.getStatusTimestamps(dto.status);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: dto.status,
        ...timestamps,
      },
      include: this.orderInclude,
    });

    return {
      message: 'Order status updated',
      data: updated,
    };
  }

  private async listOrders(
    where: Prisma.OrderWhereInput,
    query: ListOrdersQueryDto,
    message: string,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Prisma.OrderWhereInput = {
      ...where,
      ...(query.status ? { status: query.status } : {}),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: filter,
        include: this.orderInclude,
        orderBy: { placedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where: filter }),
    ]);

    return {
      message,
      data: orders,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private validateCartLines(
    items: Array<{
      id: string;
      quantity: number;
      product: {
        id: string;
        sellerId: string;
        title: string;
        price: Prisma.Decimal;
        stock: number;
        status: ProductStatus;
        currency: string;
      };
    }>,
  ): CartLine[] {
    return items.map((item) => {
      if (item.product.status !== ProductStatus.ACTIVE) {
        throw new BadRequestException(
          `${item.product.title} is no longer available`,
        );
      }

      if (item.quantity > item.product.stock) {
        throw new BadRequestException(
          `Not enough stock for ${item.product.title}`,
        );
      }

      return {
        cartItemId: item.id,
        productId: item.product.id,
        sellerId: item.product.sellerId,
        title: item.product.title,
        price: Number(item.product.price),
        quantity: item.quantity,
        stock: item.product.stock,
        currency: item.product.currency,
      };
    });
  }

  private groupLinesBySeller(lines: CartLine[]) {
    const grouped = new Map<string, CartLine[]>();

    for (const line of lines) {
      const existing = grouped.get(line.sellerId) ?? [];
      existing.push(line);
      grouped.set(line.sellerId, existing);
    }

    return grouped;
  }

  private async resolveShippingAddress(
    buyerId: string,
    shippingAddressId?: string,
  ) {
    if (shippingAddressId) {
      const address = await this.prisma.address.findFirst({
        where: { id: shippingAddressId, userId: buyerId },
      });

      if (!address) {
        throw new NotFoundException('Shipping address not found');
      }

      return address;
    }

    const defaultAddress = await this.prisma.address.findFirst({
      where: { userId: buyerId, isDefault: true },
      orderBy: { createdAt: 'desc' },
    });

    if (defaultAddress) {
      return defaultAddress;
    }

    const latestAddress = await this.prisma.address.findFirst({
      where: { userId: buyerId },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestAddress) {
      throw new BadRequestException(
        'Add a shipping address before placing an order',
      );
    }

    return latestAddress;
  }

  private async generateOrderNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let attempt = 0;

    while (attempt < 5) {
      const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
      const orderNumber = `TN-${date}-${suffix}`;
      const existing = await tx.order.findUnique({ where: { orderNumber } });

      if (!existing) {
        return orderNumber;
      }

      attempt += 1;
    }

    throw new BadRequestException('Could not generate order number');
  }

  private async getAccessibleOrder(userId: string, orderId: string) {
    const role = await this.getUserRole(userId);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (
      role !== UserRole.ADMIN &&
      order.buyerId !== userId &&
      order.sellerId !== userId
    ) {
      throw new ForbiddenException('You cannot access this order');
    }

    return order;
  }

  private async getUserRole(userId: string): Promise<UserRole> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.role;
  }

  private async ensureSellerOrAdmin(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.SELLER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Seller account required');
    }
  }

  private assertValidStatusTransition(
    current: OrderStatus,
    next: OrderStatus,
  ): void {
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.PAID, OrderStatus.CANCELLED],
      [OrderStatus.PAID]: [OrderStatus.SHIPPED, OrderStatus.REFUNDED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.REFUNDED]: [],
    };

    if (!allowed[current].includes(next)) {
      throw new BadRequestException(
        `Cannot change order status from ${current} to ${next}`,
      );
    }
  }

  private getStatusTimestamps(status: OrderStatus) {
    const now = new Date();

    switch (status) {
      case OrderStatus.PAID:
        return { paidAt: now };
      case OrderStatus.SHIPPED:
        return { shippedAt: now };
      case OrderStatus.DELIVERED:
        return { deliveredAt: now };
      case OrderStatus.CANCELLED:
        return { cancelledAt: now };
      default:
        return {};
    }
  }
}
