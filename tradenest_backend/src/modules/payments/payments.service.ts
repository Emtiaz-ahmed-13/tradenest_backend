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
import { InitGatewayPaymentDto } from './dto/init-gateway-payment.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { BkashProvider } from './providers/bkash.provider';
import { NagadProvider } from './providers/nagad.provider';
import type {
  PaymentInitRequest,
  PaymentProviderAdapter,
  PaymentVerifyResult,
} from './providers/payment-provider.interface';
import { SslcommerzProvider } from './providers/sslcommerz.provider';

type JsonRecord = Record<string, unknown>;

const paymentInclude = {
  order: {
    include: {
      buyer: { select: { id: true, name: true, email: true } },
      seller: { select: { id: true, name: true } },
      items: true,
    },
  },
} satisfies Prisma.PaymentInclude;

type PaymentWithOrder = Prisma.PaymentGetPayload<{
  include: typeof paymentInclude;
}>;

@Injectable()
export class PaymentsService {
  private readonly paymentInclude = paymentInclude;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly bkashProvider: BkashProvider,
    private readonly sslcommerzProvider: SslcommerzProvider,
    private readonly nagadProvider: NagadProvider,
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

    await this.prisma.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        type: 'CREATE',
        status: initialStatus,
        request: this.toInputJson(dto),
        response: this.toInputJson({ paymentId: payment.id }),
      },
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

  async initGatewayPayment(
    userId: string,
    paymentId: string,
    dto: InitGatewayPaymentDto,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: this.paymentInclude,
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.order.buyerId !== userId) {
      throw new ForbiddenException('Only buyer can initialize payment');
    }

    if (
      payment.provider === PaymentProvider.COD ||
      payment.provider === PaymentProvider.MANUAL
    ) {
      throw new BadRequestException('Gateway initialization is not available');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new ConflictException('Payment is already completed');
    }

    const provider = this.getProvider(payment.provider);
    const request = this.buildInitRequest(payment, dto);

    await this.prisma.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        type: 'INIT_REQUEST',
        status: PaymentStatus.PROCESSING,
        request: this.toInputJson(request),
      },
    });

    const result = await provider.initPayment(request);
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: result.status,
        providerRef: result.providerRef ?? payment.providerRef,
        metadata: this.mergeMetadata(payment.metadata, {
          gatewayInit: result.raw,
          gatewayTransactionId: result.transactionId,
          redirectUrl: result.redirectUrl,
        }),
      },
      include: this.paymentInclude,
    });

    await this.prisma.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        type: 'INIT_RESPONSE',
        status: result.status,
        request: this.toInputJson(request),
        response: this.toInputJson(result.raw ?? {}),
      },
    });

    return {
      message: 'Gateway payment initialized',
      data: {
        payment: updated,
        providerRef: result.providerRef,
        redirectUrl: result.redirectUrl,
        raw: result.raw,
      },
    };
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
          escrowHeld:
            dto.status === PaymentStatus.COMPLETED ? true : payment.escrowHeld,
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

  async handleGatewayWebhook(
    providerName: PaymentProvider,
    payload: JsonRecord,
  ) {
    const event = await this.prisma.gatewayWebhookEvent.create({
      data: {
        provider: providerName,
        eventType: this.extractWebhookEventType(payload),
        payload: this.toInputJson(payload),
      },
    });

    const provider = this.getProvider(providerName);
    const references = this.extractGatewayReferences(payload);
    const verification = await provider.verifyPayment({
      providerRef: references.providerRef,
      transactionId: references.transactionId,
      raw: payload,
    });
    const payment = await this.findPaymentForGatewayResult(
      providerName,
      payload,
      verification,
    );

    if (!payment) {
      return {
        message: 'Webhook stored but payment was not matched',
        data: { eventId: event.id, processed: false },
      };
    }

    const updated = await this.applyGatewayResult(
      payment,
      verification,
      event.id,
    );

    await this.notificationsService.create({
      userId: payment.order.buyerId,
      type: NotificationType.ORDER,
      title: 'Payment gateway update',
      body: `Payment is now ${updated.status}`,
      data: { orderId: payment.orderId, paymentId: payment.id },
    });

    return {
      message: 'Webhook processed',
      data: { eventId: event.id, payment: updated },
    };
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

  private getProvider(provider: string): PaymentProviderAdapter {
    switch (provider) {
      case PaymentProvider.BKASH:
        return this.bkashProvider;
      case PaymentProvider.SSLCOMMERZ:
        return this.sslcommerzProvider;
      case PaymentProvider.NAGAD:
        return this.nagadProvider;
      default:
        throw new BadRequestException(
          `Unsupported payment provider ${provider}`,
        );
    }
  }

  private buildInitRequest(
    payment: PaymentWithOrder,
    dto: InitGatewayPaymentDto,
  ): PaymentInitRequest {
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: payment.amount.toString(),
      currency: payment.currency,
      customerName: payment.order.buyer.name,
      customerEmail: payment.order.buyer.email,
      customerPhone: dto.customerPhone,
      callbackUrl: dto.callbackUrl,
      metadata: dto.metadata,
    };
  }

  private async applyGatewayResult(
    payment: PaymentWithOrder,
    result: PaymentVerifyResult,
    webhookEventId: string,
  ) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: result.status,
          providerRef: result.providerRef ?? payment.providerRef,
          paidAt:
            result.status === PaymentStatus.COMPLETED ? now : payment.paidAt,
          failedAt:
            result.status === PaymentStatus.FAILED ? now : payment.failedAt,
          failureReason: result.failureReason,
          escrowHeld:
            result.status === PaymentStatus.COMPLETED
              ? true
              : payment.escrowHeld,
          metadata: this.mergeMetadata(payment.metadata, {
            gatewayTransactionId: result.transactionId,
            lastGatewayResponse: result.raw,
            lastWebhookEventId: webhookEventId,
          }),
        },
        include: this.paymentInclude,
      });

      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          type: 'WEBHOOK',
          status: result.status,
          response: this.toInputJson(result.raw ?? {}),
        },
      });

      if (result.status === PaymentStatus.COMPLETED) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.PAID, paidAt: now },
        });
      }

      if (result.status === PaymentStatus.REFUNDED) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.REFUNDED },
        });
      }

      await tx.gatewayWebhookEvent.update({
        where: { id: webhookEventId },
        data: { processed: true, processedAt: now },
      });

      return updated;
    });
  }

  private async findPaymentForGatewayResult(
    provider: PaymentProvider,
    payload: JsonRecord,
    result: PaymentVerifyResult,
  ) {
    const references = this.extractGatewayReferences(payload);
    const possiblePaymentId =
      references.paymentId ??
      (provider === PaymentProvider.SSLCOMMERZ
        ? references.transactionId
        : undefined);

    if (possiblePaymentId) {
      const byId = await this.prisma.payment.findFirst({
        where: { id: possiblePaymentId, provider },
        include: this.paymentInclude,
      });

      if (byId) {
        return byId;
      }
    }

    const providerRefs = [
      result.providerRef,
      references.providerRef,
      references.validationId,
    ].filter((value): value is string => Boolean(value));

    if (providerRefs.length === 0) {
      return null;
    }

    return this.prisma.payment.findFirst({
      where: {
        provider,
        providerRef: { in: providerRefs },
      },
      include: this.paymentInclude,
    });
  }

  private extractGatewayReferences(payload: JsonRecord) {
    return {
      providerRef: this.pickString(payload, [
        'paymentID',
        'payment_id',
        'sessionkey',
        'val_id',
      ]),
      paymentId: this.pickString(payload, ['paymentId', 'payment_id']),
      transactionId: this.pickString(payload, [
        'trxID',
        'bank_tran_id',
        'tran_id',
        'transactionId',
      ]),
      validationId: this.pickString(payload, ['val_id']),
    };
  }

  private extractWebhookEventType(payload: JsonRecord): string {
    return (
      this.pickString(payload, [
        'eventType',
        'event',
        'status',
        'transactionStatus',
      ]) ?? 'payment.webhook'
    );
  }

  private pickString(payload: JsonRecord, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = payload[key];

      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    return undefined;
  }

  private toInputJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private mergeMetadata(
    existing: Prisma.JsonValue | null,
    next: JsonRecord,
  ): Prisma.InputJsonObject {
    const existingRecord =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as JsonRecord)
        : {};

    return Object.fromEntries(
      Object.entries({ ...existingRecord, ...next }).filter(
        ([, value]) => value !== undefined,
      ),
    ) as Prisma.InputJsonObject;
  }
}
