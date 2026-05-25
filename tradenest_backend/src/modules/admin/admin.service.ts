import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  NotificationType,
  ProductStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListAdminQueryDto } from './dto/list-admin-query.dto';
import { RejectProductDto } from './dto/reject-product.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listUsers(adminId: string, query: ListAdminQueryDto) {
    await this.ensureAdmin(adminId);

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
    await this.ensureAdmin(adminId);

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
    await this.ensureAdmin(adminId);

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
    await this.ensureAdmin(adminId);

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
    await this.ensureAdmin(adminId);

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
    await this.ensureAdmin(adminId);

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
    await this.ensureAdmin(adminId);

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
    await this.ensureAdmin(adminId);

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

  private async ensureAdmin(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });

    if (!user || user.role !== UserRole.ADMIN || !user.isActive) {
      throw new ForbiddenException('Admin account required');
    }
  }
}
