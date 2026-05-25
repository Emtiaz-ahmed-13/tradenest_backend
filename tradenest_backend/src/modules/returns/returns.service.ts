import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  NotificationType,
  OrderStatus,
  ReturnRequestStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { UpdateReturnRequestDto } from './dto/update-return-request.dto';

@Injectable()
export class ReturnsService {
  private readonly returnInclude: Prisma.ReturnRequestInclude = {
    order: {
      include: {
        items: true,
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true } },
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateReturnRequestDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { returnRequests: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId !== userId) {
      throw new ForbiddenException('Only buyer can request return');
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Only delivered orders can be returned');
    }

    if (
      order.returnRequests.some(
        (request) => request.status !== ReturnRequestStatus.CANCELLED,
      )
    ) {
      throw new BadRequestException('Return request already exists');
    }

    const request = await this.prisma.returnRequest.create({
      data: {
        orderId: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        reason: dto.reason,
      },
      include: this.returnInclude,
    });

    await this.notificationsService.create({
      userId: order.sellerId,
      type: NotificationType.ORDER,
      title: 'New return request',
      body: `Return requested for ${order.orderNumber}`,
      data: { orderId: order.id, returnRequestId: request.id },
    });

    return { message: 'Return request created', data: request };
  }

  async listMine(userId: string) {
    const requests = await this.prisma.returnRequest.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      include: this.returnInclude,
      orderBy: { createdAt: 'desc' },
    });

    return { message: 'Return requests retrieved', data: requests };
  }

  async findOne(userId: string, requestId: string) {
    const role = await this.getUserRole(userId);
    const request = await this.prisma.returnRequest.findUnique({
      where: { id: requestId },
      include: this.returnInclude,
    });

    if (!request) {
      throw new NotFoundException('Return request not found');
    }

    if (
      role !== UserRole.ADMIN &&
      request.buyerId !== userId &&
      request.sellerId !== userId
    ) {
      throw new ForbiddenException('You cannot access this return request');
    }

    return { message: 'Return request retrieved', data: request };
  }

  async updateStatus(
    userId: string,
    requestId: string,
    dto: UpdateReturnRequestDto,
  ) {
    const role = await this.getUserRole(userId);
    const request = await this.prisma.returnRequest.findUnique({
      where: { id: requestId },
      include: { order: true },
    });

    if (!request) {
      throw new NotFoundException('Return request not found');
    }

    if (role !== UserRole.ADMIN && request.sellerId !== userId) {
      throw new ForbiddenException('Seller or admin required');
    }

    this.assertTransition(request.status, dto.status);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.returnRequest.update({
        where: { id: requestId },
        data: {
          status: dto.status,
          adminNote: dto.adminNote,
        },
        include: this.returnInclude,
      });

      if (dto.status === ReturnRequestStatus.REFUNDED) {
        await tx.order.update({
          where: { id: request.orderId },
          data: { status: OrderStatus.REFUNDED },
        });

        await tx.payment.updateMany({
          where: { orderId: request.orderId },
          data: { status: 'REFUNDED' },
        });
      }

      return next;
    });

    await this.notificationsService.create({
      userId: request.buyerId,
      type: NotificationType.ORDER,
      title: 'Return request updated',
      body: `Return request is now ${dto.status}`,
      data: { orderId: request.orderId, returnRequestId: requestId },
    });

    return { message: 'Return request updated', data: updated };
  }

  private assertTransition(
    current: ReturnRequestStatus,
    next: ReturnRequestStatus,
  ) {
    const allowed: Record<ReturnRequestStatus, ReturnRequestStatus[]> = {
      [ReturnRequestStatus.REQUESTED]: [
        ReturnRequestStatus.APPROVED,
        ReturnRequestStatus.REJECTED,
        ReturnRequestStatus.CANCELLED,
      ],
      [ReturnRequestStatus.APPROVED]: [
        ReturnRequestStatus.RECEIVED,
        ReturnRequestStatus.CANCELLED,
      ],
      [ReturnRequestStatus.RECEIVED]: [ReturnRequestStatus.REFUNDED],
      [ReturnRequestStatus.REJECTED]: [],
      [ReturnRequestStatus.REFUNDED]: [],
      [ReturnRequestStatus.CANCELLED]: [],
    };

    if (!allowed[current].includes(next)) {
      throw new BadRequestException(
        `Cannot change return status from ${current} to ${next}`,
      );
    }
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
