import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { ProductStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';

@Injectable()
export class WishlistService {
  private readonly wishlistInclude: Prisma.WishlistItemInclude = {
    product: {
      include: {
        images: {
          orderBy: [
            { isPrimary: 'desc' },
            { sortOrder: 'asc' },
            { createdAt: 'asc' },
          ],
        },
        seller: {
          select: {
            id: true,
            name: true,
            sellerProfile: {
              select: { shopName: true, slug: true },
            },
          },
        },
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      include: this.wishlistInclude,
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Wishlist retrieved',
      data: items,
    };
  }

  async add(userId: string, dto: AddWishlistItemDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.status !== ProductStatus.ACTIVE) {
      throw new ConflictException('Product is not available');
    }

    try {
      const item = await this.prisma.wishlistItem.create({
        data: {
          userId,
          productId: dto.productId,
        },
        include: this.wishlistInclude,
      });

      return {
        message: 'Product added to wishlist',
        data: item,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Product is already in wishlist');
      }

      throw error;
    }
  }

  async toggle(userId: string, dto: AddWishlistItemDto) {
    const existing = await this.prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId: dto.productId,
        },
      },
    });

    if (existing) {
      await this.prisma.wishlistItem.delete({ where: { id: existing.id } });

      return {
        message: 'Product removed from wishlist',
        data: { productId: dto.productId, inWishlist: false },
      };
    }

    const created = await this.add(userId, dto);

    return {
      message: 'Product added to wishlist',
      data: { ...created.data, inWishlist: true },
    };
  }

  async remove(userId: string, productId: string) {
    const existing = await this.prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Wishlist item not found');
    }

    await this.prisma.wishlistItem.delete({ where: { id: existing.id } });

    return {
      message: 'Product removed from wishlist',
      data: { productId },
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
