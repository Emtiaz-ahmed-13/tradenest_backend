import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { ProductStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
  private readonly cartItemInclude: Prisma.CartItemInclude = {
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

  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);

    return {
      message: 'Cart retrieved',
      data: this.formatCart(cart),
    };
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.getActiveProduct(dto.productId);

    if (product.stock < dto.quantity) {
      throw new BadRequestException('Not enough stock available');
    }

    const cart = await this.getOrCreateCart(userId);
    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: dto.productId,
        },
      },
    });

    if (existingItem) {
      const nextQuantity = existingItem.quantity + dto.quantity;

      if (product.stock < nextQuantity) {
        throw new BadRequestException('Not enough stock available');
      }

      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: nextQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          quantity: dto.quantity,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.ensureCartItemOwnership(userId, itemId);

    if (item.product.stock < dto.quantity) {
      throw new BadRequestException('Not enough stock available');
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    await this.ensureCartItemOwnership(userId, itemId);

    await this.prisma.cartItem.delete({ where: { id: itemId } });

    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);

    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    return this.getCart(userId);
  }

  private async getOrCreateCart(userId: string) {
    const existingCart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: this.cartItemInclude,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (existingCart) {
      return existingCart;
    }

    return this.prisma.cart.create({
      data: { userId },
      include: {
        items: {
          include: this.cartItemInclude,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  private async ensureCartItemOwnership(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cart: { userId },
      },
      include: {
        product: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    if (item.product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Product is no longer available');
    }

    return item;
  }

  private async getActiveProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.status !== ProductStatus.ACTIVE) {
      throw new BadRequestException('Product is not available for purchase');
    }

    return product;
  }

  private formatCart(cart: {
    id: string;
    items: Array<{
      id: string;
      quantity: number;
      product: {
        price: Prisma.Decimal;
        currency: string;
      } & Record<string, unknown>;
    }>;
  }) {
    const items = cart.items.map((item) => {
      const unitPrice = Number(item.product.price);
      const lineTotal = unitPrice * item.quantity;

      return {
        id: item.id,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        product: item.product,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    return {
      id: cart.id,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
      currency: items[0]?.product.currency ?? 'BDT',
      items,
    };
  }
}
