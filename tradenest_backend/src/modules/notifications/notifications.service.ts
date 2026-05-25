import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { NotificationType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationsGateway } from './notifications.gateway';

type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async create(input: CreateNotificationInput) {
    const preferences = await this.getOrCreatePreferences(input.userId);

    if (!this.shouldCreateInAppNotification(input.type, preferences)) {
      return null;
    }

    const notification = await this.prisma.notification.create({
      data: input,
    });

    this.gateway.emitToUser(input.userId, 'notification:new', notification);

    return notification;
  }

  async getPreferences(userId: string) {
    const preferences = await this.getOrCreatePreferences(userId);

    return {
      message: 'Notification preferences retrieved',
      data: preferences,
    };
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    await this.getOrCreatePreferences(userId);

    const preferences = await this.prisma.notificationPreference.update({
      where: { userId },
      data: dto,
    });

    return {
      message: 'Notification preferences updated',
      data: preferences,
    };
  }

  async list(userId: string, query: ListNotificationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = {
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          userId,
          readAt: null,
        },
      }),
    ]);

    return {
      message: 'Notifications retrieved',
      data: notifications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });

    return {
      message: 'Notification marked as read',
      data: updated,
    };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return {
      message: 'Notifications marked as read',
      data: { count: result.count },
    };
  }

  private async getOrCreatePreferences(userId: string) {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.notificationPreference.create({
      data: { userId },
    });
  }

  private shouldCreateInAppNotification(
    type: NotificationType,
    preferences: {
      inApp: boolean;
      orderUpdates: boolean;
      productUpdates: boolean;
      promotions: boolean;
    },
  ) {
    if (!preferences.inApp) {
      return false;
    }

    if (type === NotificationType.ORDER) {
      return preferences.orderUpdates;
    }

    if (type === NotificationType.PRODUCT) {
      return preferences.productUpdates;
    }

    if (type === NotificationType.PROMOTION) {
      return preferences.promotions;
    }

    return true;
  }
}
