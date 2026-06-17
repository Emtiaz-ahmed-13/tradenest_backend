import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  NotificationType,
  ProductStatus,
} from '../../../generated/prisma/enums';
import { ensureAdmin } from '../../common/helpers/role-check.helper';
import { AuditService } from '../../common/services/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { ListAdminQueryDto } from './dto/list-admin-query.dto';
import { RejectProductDto } from './dto/reject-product.dto';
import { UpdateAdminSettingsDto } from './dto/update-admin-settings.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async listUsers(adminId: string, query: ListAdminQueryDto) {
    await ensureAdmin(this.prisma, adminId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          sellerProfile: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      message: 'Users retrieved',
      data: users,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUser(adminId: string, userId: string) {
    await ensureAdmin(this.prisma, adminId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        sellerProfile: true,
        addresses: true,
        _count: {
          select: {
            products: true,
            orders: true,
            soldOrders: true,
            reviews: true,
            receivedReviews: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { message: 'User retrieved', data: user };
  }

  async setUserActive(adminId: string, userId: string, isActive: boolean) {
    await ensureAdmin(this.prisma, adminId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    await this.notificationsService.create({
      userId,
      type: NotificationType.SYSTEM,
      title: isActive ? 'Account reactivated' : 'Account suspended',
      body: isActive
        ? 'Your TradeNest account is active again.'
        : 'Your TradeNest account has been suspended.',
      data: { userId },
    });

    return {
      message: isActive ? 'User reactivated' : 'User suspended',
      data: user,
    };
  }

  async listModerationProducts(adminId: string, query: ListAdminQueryDto) {
    await ensureAdmin(this.prisma, adminId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.PENDING_REVIEW,
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          seller: {
            select: {
              id: true,
              name: true,
              sellerProfile: true,
            },
          },
          category: true,
          images: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      message: 'Moderation products retrieved',
      data: products,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async approveProduct(adminId: string, productId: string) {
    await ensureAdmin(this.prisma, adminId);

    const product = await this.prisma.product.update({
      where: { id: productId },
      data: {
        status: ProductStatus.ACTIVE,
        publishedAt: new Date(),
      },
      include: { seller: true },
    });

    await this.notificationsService.create({
      userId: product.sellerId,
      type: NotificationType.PRODUCT,
      title: 'Product approved',
      body: `${product.title} is now live.`,
      data: { productId },
    });

    return { message: 'Product approved', data: product };
  }

  async rejectProduct(
    adminId: string,
    productId: string,
    dto: RejectProductDto,
  ) {
    await ensureAdmin(this.prisma, adminId);

    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.REJECTED },
    });

    await this.notificationsService.create({
      userId: product.sellerId,
      type: NotificationType.PRODUCT,
      title: 'Product rejected',
      body: dto.reason ?? `${product.title} was rejected by moderation.`,
      data: { productId, reason: dto.reason },
    });

    return { message: 'Product rejected', data: product };
  }

  async listFlaggedReviews(adminId: string) {
    await ensureAdmin(this.prisma, adminId);

    const reviews = await this.prisma.review.findMany({
      where: { isFlagged: true },
      include: {
        author: { select: { id: true, name: true, email: true } },
        target: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { flaggedAt: 'desc' },
    });

    return { message: 'Flagged reviews retrieved', data: reviews };
  }

  async resolveReviewFlag(adminId: string, reviewId: string) {
    await ensureAdmin(this.prisma, adminId);

    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        isFlagged: false,
        flagReason: null,
        flaggedAt: null,
      },
    });

    return { message: 'Review flag resolved', data: review };
  }

  async getDashboard(adminId: string) {
    await ensureAdmin(this.prisma, adminId);

    const [
      users,
      sellers,
      products,
      orders,
      paidOrders,
      payments,
      pendingKyc,
      openReturns,
      activeBanners,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.sellerProfile.count(),
      this.prisma.product.count(),
      this.prisma.order.aggregate({
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: { status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.kycVerification.count({ where: { status: 'PENDING' } }),
      this.prisma.returnRequest.count({
        where: { status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED'] } },
      }),
      this.prisma.banner.count({ where: { isActive: true } }),
    ]);

    return {
      message: 'Admin dashboard retrieved',
      data: {
        users,
        sellers,
        products,
        orders: {
          count: orders._count._all,
          total: this.toNumber(orders._sum.total),
          paidCount: paidOrders._count._all,
          paidTotal: this.toNumber(paidOrders._sum.total),
        },
        payments: {
          completedCount: payments._count._all,
          completedTotal: this.toNumber(payments._sum.amount),
        },
        pendingKyc,
        openReturns,
        activeBanners,
      },
    };
  }

  async listBanners(adminId: string) {
    await ensureAdmin(this.prisma, adminId);

    const banners = await this.prisma.banner.findMany({
      orderBy: [
        { position: 'asc' },
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return { message: 'Banners retrieved', data: banners };
  }

  async createBanner(adminId: string, dto: CreateBannerDto) {
    await ensureAdmin(this.prisma, adminId);

    const banner = await this.prisma.banner.create({
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        position: dto.position,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });

    await this.auditService.log({
      actorId: adminId,
      action: 'banner.create',
      entityType: 'Banner',
      entityId: banner.id,
      metadata: { title: banner.title, position: banner.position },
    });

    return { message: 'Banner created', data: banner };
  }

  async updateBanner(adminId: string, bannerId: string, dto: UpdateBannerDto) {
    await ensureAdmin(this.prisma, adminId);

    const banner = await this.prisma.banner.update({
      where: { id: bannerId },
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        position: dto.position,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });

    await this.auditService.log({
      actorId: adminId,
      action: 'banner.update',
      entityType: 'Banner',
      entityId: banner.id,
      metadata: { title: banner.title, position: banner.position },
    });

    return { message: 'Banner updated', data: banner };
  }

  async deleteBanner(adminId: string, bannerId: string) {
    await ensureAdmin(this.prisma, adminId);

    const banner = await this.prisma.banner.delete({
      where: { id: bannerId },
    });

    await this.auditService.log({
      actorId: adminId,
      action: 'banner.delete',
      entityType: 'Banner',
      entityId: banner.id,
      metadata: { title: banner.title, position: banner.position },
    });

    return { message: 'Banner deleted', data: banner };
  }

  async getSettings(adminId: string) {
    await ensureAdmin(this.prisma, adminId);

    const settings = await this.prisma.adminSetting.findMany({
      orderBy: { key: 'asc' },
    });

    return {
      message: 'Admin settings retrieved',
      data: settings.reduce<Record<string, unknown>>((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {}),
    };
  }

  async updateSettings(adminId: string, dto: UpdateAdminSettingsDto) {
    await ensureAdmin(this.prisma, adminId);

    const settings = await this.prisma.$transaction(
      Object.entries(dto.settings).map(([key, value]) =>
        this.prisma.adminSetting.upsert({
          where: { key },
          create: { key, value: value as Prisma.InputJsonValue },
          update: { value: value as Prisma.InputJsonValue },
        }),
      ),
    );

    await this.auditService.log({
      actorId: adminId,
      action: 'settings.update',
      entityType: 'AdminSetting',
      metadata: { keys: settings.map((setting) => setting.key) },
    });

    return {
      message: 'Admin settings updated',
      data: settings.reduce<Record<string, unknown>>((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {}),
    };
  }

  async listAuditLogs(adminId: string, query: ListAuditLogsQueryDto) {
    await ensureAdmin(this.prisma, adminId);

    return this.auditService.list(
      query.entityType,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  private toNumber(value: Prisma.Decimal | number | null | undefined) {
    return value === null || value === undefined ? 0 : Number(value);
  }
}
