import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  FlashSaleStatus,
  ProductStatus,
} from '../../../generated/prisma/enums';
import { ensureAdmin } from '../../common/helpers/role-check.helper';
import { PrismaService } from '../../prisma/prisma.service';
import { AttachFlashSaleProductsDto } from './dto/attach-flash-sale-products.dto';
import { CreateFlashSaleDto } from './dto/create-flash-sale.dto';
import { FlashSaleProductDto } from './dto/flash-sale-product.dto';
import { UpdateFlashSaleDto } from './dto/update-flash-sale.dto';

@Injectable()
export class FlashSaleService {
  private readonly flashSaleInclude: Prisma.FlashSaleInclude = {
    products: {
      include: {
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
                sellerProfile: { select: { shopName: true, slug: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async create(adminId: string, dto: CreateFlashSaleDto) {
    await ensureAdmin(this.prisma, adminId);
    this.assertValidDateRange(dto.startsAt, dto.endsAt);

    if (dto.products?.length) {
      await this.validateProducts(dto.products);
    }

    const flashSale = await this.prisma.flashSale.create({
      data: {
        title: dto.title,
        description: dto.description,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        products: dto.products?.length
          ? { create: dto.products.map((product) => ({ ...product })) }
          : undefined,
      },
      include: this.flashSaleInclude,
    });

    return {
      message: 'Flash sale scheduled',
      data: flashSale,
    };
  }

  async listActive() {
    await this.endExpiredSales();

    const now = new Date();
    const flashSales = await this.prisma.flashSale.findMany({
      where: {
        status: FlashSaleStatus.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      include: this.flashSaleInclude,
      orderBy: { endsAt: 'asc' },
    });

    return {
      message: 'Active flash sales retrieved',
      data: flashSales,
    };
  }

  async listAll(adminId: string) {
    await ensureAdmin(this.prisma, adminId);

    const flashSales = await this.prisma.flashSale.findMany({
      include: this.flashSaleInclude,
      orderBy: { startsAt: 'desc' },
    });

    return {
      message: 'Flash sales retrieved',
      data: flashSales,
    };
  }

  async update(adminId: string, flashSaleId: string, dto: UpdateFlashSaleDto) {
    await ensureAdmin(this.prisma, adminId);
    const flashSale = await this.ensureFlashSale(flashSaleId);
    const startsAt = dto.startsAt ?? flashSale.startsAt.toISOString();
    const endsAt = dto.endsAt ?? flashSale.endsAt.toISOString();

    this.assertValidDateRange(startsAt, endsAt);

    if (dto.products?.length) {
      await this.validateProducts(dto.products);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.products) {
        await tx.flashSaleProduct.deleteMany({ where: { flashSaleId } });
      }

      return tx.flashSale.update({
        where: { id: flashSaleId },
        data: {
          title: dto.title,
          description: dto.description,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
          products: dto.products?.length
            ? { create: dto.products.map((product) => ({ ...product })) }
            : undefined,
        },
        include: this.flashSaleInclude,
      });
    });

    return {
      message: 'Flash sale updated',
      data: updated,
    };
  }

  async activate(adminId: string, flashSaleId: string) {
    await ensureAdmin(this.prisma, adminId);
    const flashSale = await this.ensureFlashSale(flashSaleId);

    if (flashSale.status === FlashSaleStatus.CANCELLED) {
      throw new BadRequestException(
        'Cancelled flash sales cannot be activated',
      );
    }

    if (flashSale.endsAt <= new Date()) {
      throw new BadRequestException('Expired flash sales cannot be activated');
    }

    const updated = await this.prisma.flashSale.update({
      where: { id: flashSaleId },
      data: { status: FlashSaleStatus.ACTIVE },
      include: this.flashSaleInclude,
    });

    return {
      message: 'Flash sale activated',
      data: updated,
    };
  }

  async cancel(adminId: string, flashSaleId: string) {
    await ensureAdmin(this.prisma, adminId);
    await this.ensureFlashSale(flashSaleId);

    const updated = await this.prisma.flashSale.update({
      where: { id: flashSaleId },
      data: { status: FlashSaleStatus.CANCELLED },
      include: this.flashSaleInclude,
    });

    return {
      message: 'Flash sale cancelled',
      data: updated,
    };
  }

  async attachProducts(
    adminId: string,
    flashSaleId: string,
    dto: AttachFlashSaleProductsDto,
  ) {
    await ensureAdmin(this.prisma, adminId);
    await this.ensureFlashSale(flashSaleId);
    await this.validateProducts(dto.products);

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const product of dto.products) {
        await tx.flashSaleProduct.upsert({
          where: {
            flashSaleId_productId: {
              flashSaleId,
              productId: product.productId,
            },
          },
          create: {
            flashSaleId,
            productId: product.productId,
            salePrice: product.salePrice,
            stockLimit: product.stockLimit,
          },
          update: {
            salePrice: product.salePrice,
            stockLimit: product.stockLimit,
          },
        });
      }

      return tx.flashSale.findUnique({
        where: { id: flashSaleId },
        include: this.flashSaleInclude,
      });
    });

    return {
      message: 'Flash sale products attached',
      data: updated,
    };
  }

  private async ensureFlashSale(flashSaleId: string) {
    const flashSale = await this.prisma.flashSale.findUnique({
      where: { id: flashSaleId },
    });

    if (!flashSale) {
      throw new NotFoundException('Flash sale not found');
    }

    return flashSale;
  }

  private async validateProducts(products: FlashSaleProductDto[]) {
    if (!products.length) {
      throw new BadRequestException('At least one product is required');
    }

    const productIds = new Set<string>();

    for (const item of products) {
      if (productIds.has(item.productId)) {
        throw new BadRequestException('Duplicate flash sale product');
      }

      productIds.add(item.productId);

      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      if (product.status !== ProductStatus.ACTIVE) {
        throw new BadRequestException(`${product.title} is not active`);
      }

      if (Number(product.price) <= item.salePrice) {
        throw new BadRequestException(
          `${product.title} sale price must be below regular price`,
        );
      }

      if (item.stockLimit && item.stockLimit > product.stock) {
        throw new BadRequestException(
          `${product.title} stock limit exceeds available stock`,
        );
      }
    }
  }

  private assertValidDateRange(startsAt: string, endsAt: string): void {
    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    if (startDate >= endDate) {
      throw new BadRequestException('Flash sale start date must be before end');
    }
  }

  private async endExpiredSales(): Promise<void> {
    await this.prisma.flashSale.updateMany({
      where: {
        status: FlashSaleStatus.ACTIVE,
        endsAt: { lte: new Date() },
      },
      data: { status: FlashSaleStatus.ENDED },
    });
  }
}
