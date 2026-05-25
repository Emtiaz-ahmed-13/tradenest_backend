import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { NotificationType, OrderStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { FlagReviewDto } from './dto/flag-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';

@Injectable()
export class ReviewsService {
  private readonly reviewInclude: Prisma.ReviewInclude = {
    author: {
      select: {
        id: true,
        name: true,
        image: true,
      },
    },
    target: {
      select: {
        id: true,
        name: true,
        sellerProfile: {
          select: { shopName: true, slug: true },
        },
      },
    },
    product: {
      select: {
        id: true,
        title: true,
        slug: true,
        sellerId: true,
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(authorId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: {
        id: true,
        title: true,
        sellerId: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.sellerId === authorId) {
      throw new BadRequestException('You cannot review your own product');
    }

    const deliveredOrderItem = await this.prisma.orderItem.findFirst({
      where: {
        productId: dto.productId,
        order: {
          buyerId: authorId,
          status: OrderStatus.DELIVERED,
        },
      },
    });

    if (!deliveredOrderItem) {
      throw new ForbiddenException('Only delivered buyers can review');
    }

    try {
      const review = await this.prisma.review.create({
        data: {
          productId: dto.productId,
          authorId,
          targetId: product.sellerId,
          rating: dto.rating,
          comment: dto.comment,
        },
        include: this.reviewInclude,
      });

      await this.notificationsService.create({
        userId: product.sellerId,
        type: NotificationType.PRODUCT,
        title: 'New product review',
        body: `${review.author.name} reviewed ${product.title}`,
        data: {
          reviewId: review.id,
          productId: product.id,
          rating: review.rating,
        },
      });

      return {
        message: 'Review created',
        data: review,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('You already reviewed this product');
      }

      throw error;
    }
  }

  async listForProduct(productId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { productId },
      include: this.reviewInclude,
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Product reviews retrieved',
      data: reviews,
    };
  }

  async listForSeller(sellerId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { targetId: sellerId },
      include: this.reviewInclude,
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Seller reviews retrieved',
      data: reviews,
    };
  }

  async reply(sellerId: string, reviewId: string, dto: ReplyReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        product: true,
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.product.sellerId !== sellerId) {
      throw new ForbiddenException('Only product seller can reply');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        sellerReply: dto.reply,
        repliedAt: new Date(),
      },
      include: this.reviewInclude,
    });

    await this.notificationsService.create({
      userId: review.authorId,
      type: NotificationType.PRODUCT,
      title: 'Seller replied to your review',
      body: `Seller replied on ${review.product.title}`,
      data: {
        reviewId,
        productId: review.productId,
      },
    });

    return {
      message: 'Review replied',
      data: updated,
    };
  }

  async flag(userId: string, reviewId: string, dto: FlagReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        isFlagged: true,
        flagReason: dto.reason,
        flaggedAt: new Date(),
      },
      include: this.reviewInclude,
    });

    await this.notificationsService.create({
      userId,
      type: NotificationType.SYSTEM,
      title: 'Review flagged',
      body: 'Thanks, our team will check this review.',
      data: { reviewId },
    });

    return {
      message: 'Review flagged',
      data: updated,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
