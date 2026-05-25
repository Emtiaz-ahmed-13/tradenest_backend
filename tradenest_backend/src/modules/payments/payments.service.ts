import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  NotificationType,
  OrderStatus,
  PaymentStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePaymentDto, PaymentProvider } from './dto/create-payment.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

@Injectable()
export class PaymentsService {
  private readonly paymentInclude: Prisma.PaymentInclude = {
    order: {
      include: {
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true } },
        items: true,
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreatePaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { payment: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId !== userId) {
      throw new ForbiddenException('Only buyer can start payment');
    }

    if (order.payment) {
      throw new ConflictException('Payment already exists for this order');
    }

    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REFUNDED
    ) {
      throw new BadRequestException('Cannot pay for this order');
    }

    const initialStatus =
      dto.provider === PaymentProvider.COD
        ? PaymentStatus.PROCESSING
        : PaymentStatus.PENDING;

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: dto.provider,
        providerRef: dto.providerRef,
        amount: order.total,
        currency: order.currency,
        status: initialStatus,
        metadata: {
          initiatedBy: userId,
        },
      },
      include: this.paymentInclude,
    });

    await this.notificationsService.create({
      userId: order.sellerId,
      type: NotificationType.ORDER,
      title: 'Payment started',
      body: `${dto.provider} payment started for ${order.orderNumber}`,
      data: { orderId: order.id, paymentId: payment.id },
    });

    return { message: 'Payment initialized', data: payment };
  }

  async listMine(userId: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        order: {
          OR: [{ buyerId: userId }, { sellerId: userId }],
        },
      },
      include: this.paymentInclude,
      orderBy: { createdAt: 'desc' },
    });

    return { message: 'Payments retrieved', data: payments };
  }

  async findOne(userId: string, paymentId: string) {
    const role = await this.getUserRole(userId);
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: this.paymentInclude,
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (
      role !== UserRole.ADMIN &&
      payment.order.buyerId !== userId &&
      payment.order.sellerId !== userId
    ) {
      throw new ForbiddenException('You cannot access this payment');
    }

    return { message: 'Payment retrieved', data: payment };
  }

  async updateStatus(
    userId: string,
    paymentId: string,
    dto: UpdatePaymentStatusDto,
  ) {
    const role = await this.getUserRole(userId);
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (role !== UserRole.ADMIN && payment.order.sellerId !== userId) {
      throw new ForbiddenException('Seller or admin required');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const nextPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: dto.status,
          providerRef: dto.providerRef ?? payment.providerRef,
          paidAt: dto.status === PaymentStatus.COMPLETED ? now : payment.paidAt,
          failedAt:
            dto.status === PaymentStatus.FAILED ? now : payment.failedAt,
          failureReason: dto.failureReason,
        },
        include: this.paymentInclude,
      });

      if (dto.status === PaymentStatus.COMPLETED) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.PAID, paidAt: now },
        });
      }

      if (dto.status === PaymentStatus.REFUNDED) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.REFUNDED },
        });
      }

      return nextPayment;
    });

    await this.notificationsService.create({
      userId: payment.order.buyerId,
      type: NotificationType.ORDER,
      title: 'Payment status updated',
      body: `Payment is now ${dto.status}`,
      data: { orderId: payment.orderId, paymentId },
    });

    return { message: 'Payment status updated', data: updated };
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
}
