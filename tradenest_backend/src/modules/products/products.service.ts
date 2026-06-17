import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { ProductStatus, UserRole } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductStatusDto } from './dto/update-product-status.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  private readonly productInclude: Prisma.ProductInclude = {
    category: true,
    brand: true,
    seller: {
      select: {
        id: true,
        name: true,
        image: true,
        sellerProfile: {
          select: {
            shopName: true,
            slug: true,
            rating: true,
            isVerified: true,
          },
        },
      },
    },
    images: {
      orderBy: [
        { isPrimary: 'desc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    },
    tags: true,
  };

  constructor(private readonly prisma: PrismaService) {}

  async create(sellerId: string, dto: CreateProductDto) {
    await this.ensureSeller(sellerId);
    await this.ensureCategoryExists(dto.categoryId);
    await this.ensureBrandExists(dto.brandId);

    const slug = await this.createUniqueSlug(dto.title);
    const status = dto.status ?? ProductStatus.DRAFT;

    const product = await this.prisma.product.create({
      data: {
        title: dto.title,
        slug,
        description: dto.description,
        richDescription: dto.richDescription,
        condition: dto.condition,
        listingType: dto.listingType,
        status,
        price: dto.price,
        compareAtPrice: dto.compareAtPrice,
        currency: dto.currency ?? 'BDT',
        stock: dto.stock ?? 1,
        sku: dto.sku,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        sellerId,
        location: dto.location,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        isBoosted: dto.isBoosted ?? false,
        boostedUntil: dto.boostedUntil ? new Date(dto.boostedUntil) : undefined,
        publishedAt: status === ProductStatus.ACTIVE ? new Date() : undefined,
        images: dto.images?.length
          ? {
              create: this.normalizeImages(dto.images),
            }
          : undefined,
        tags: dto.tags?.length
          ? {
              create: dto.tags.map((name) => ({
                name: name.trim().toLowerCase(),
              })),
            }
          : undefined,
      },
      include: this.productInclude,
    });

    return {
      message: 'Product created',
      data: product,
    };
  }

  async findAll(query: ListProductsQueryDto) {
    await this.autoDelistExpiredProducts();

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = {
      ...(query.status
        ? { status: query.status }
        : { status: ProductStatus.ACTIVE }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
      ...(query.condition ? { condition: query.condition } : {}),
      ...(query.listingType ? { listingType: query.listingType } : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' as const } },
              {
                description: {
                  contains: query.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const orderBy = this.resolveSortOrder(query.sort);

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: this.productInclude,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      message: 'Products retrieved',
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findMine(sellerId: string, query: ListProductsQueryDto) {
    await this.ensureSeller(sellerId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = {
      sellerId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.condition ? { condition: query.condition } : {}),
      ...(query.listingType ? { listingType: query.listingType } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' as const } },
              {
                description: {
                  contains: query.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: this.productInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      message: 'Seller products retrieved',
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(idOrSlug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: this.productInclude,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.product.update({
      where: { id: product.id },
      data: { viewCount: { increment: 1 } },
    });

    return {
      message: 'Product retrieved',
      data: { ...product, viewCount: product.viewCount + 1 },
    };
  }

  async bulkCreate(sellerId: string, products: CreateProductDto[]) {
    const created: Awaited<ReturnType<typeof this.create>>['data'][] = [];

    for (const dto of products) {
      const result = await this.create(sellerId, dto);
      created.push(result.data);
    }

    return {
      message: 'Bulk products created',
      data: created,
      meta: { count: created.length },
    };
  }

  async update(sellerId: string, productId: string, dto: UpdateProductDto) {
    const existingProduct = await this.ensureProductOwnership(
      sellerId,
      productId,
    );

    if (dto.categoryId) {
      await this.ensureCategoryExists(dto.categoryId);
    }

    await this.ensureBrandExists(dto.brandId);

    const nextStatus = dto.status ?? existingProduct.status;
    const product = await this.prisma.$transaction(async (tx) => {
      if (dto.images) {
        await tx.productImage.deleteMany({ where: { productId } });
      }

      if (dto.tags) {
        await tx.productTag.deleteMany({ where: { productId } });
      }

      return tx.product.update({
        where: { id: productId },
        data: {
          title: dto.title,
          slug: dto.title
            ? await this.createUniqueSlug(dto.title, productId)
            : undefined,
          description: dto.description,
          richDescription: dto.richDescription,
          condition: dto.condition,
          listingType: dto.listingType,
          status: dto.status,
          price: dto.price,
          compareAtPrice: dto.compareAtPrice,
          currency: dto.currency,
          stock: dto.stock,
          sku: dto.sku,
          categoryId: dto.categoryId,
          brandId: dto.brandId,
          location: dto.location,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          isBoosted: dto.isBoosted,
          boostedUntil: dto.boostedUntil
            ? new Date(dto.boostedUntil)
            : undefined,
          publishedAt:
            existingProduct.status !== ProductStatus.ACTIVE &&
            nextStatus === ProductStatus.ACTIVE
              ? new Date()
              : undefined,
          images: dto.images
            ? { create: this.normalizeImages(dto.images) }
            : undefined,
          tags: dto.tags
            ? {
                create: dto.tags.map((name) => ({
                  name: name.trim().toLowerCase(),
                })),
              }
            : undefined,
        },
        include: this.productInclude,
      });
    });

    return {
      message: 'Product updated',
      data: product,
    };
  }

  async updateStatus(
    sellerId: string,
    productId: string,
    dto: UpdateProductStatusDto,
  ) {
    const existingProduct = await this.ensureProductOwnership(
      sellerId,
      productId,
    );

    const product = await this.prisma.product.update({
      where: { id: productId },
      data: {
        status: dto.status,
        publishedAt:
          existingProduct.status !== ProductStatus.ACTIVE &&
          dto.status === ProductStatus.ACTIVE
            ? new Date()
            : existingProduct.publishedAt,
      },
      include: this.productInclude,
    });

    return {
      message: 'Product status updated',
      data: product,
    };
  }

  async remove(sellerId: string, productId: string) {
    await this.ensureProductOwnership(sellerId, productId);

    await this.prisma.product.delete({ where: { id: productId } });

    return {
      message: 'Product deleted',
      data: { id: productId },
    };
  }

  private async ensureSeller(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, sellerProfile: { select: { id: true } } },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.SELLER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Seller account required');
    }

    if (user.role === UserRole.SELLER && !user.sellerProfile) {
      throw new BadRequestException('Complete seller onboarding first');
    }
  }

  private async ensureCategoryExists(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }

  private async ensureBrandExists(brandId?: string): Promise<void> {
    if (!brandId) {
      return;
    }

    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
  }

  private async ensureProductOwnership(sellerId: string, productId: string) {
    await this.ensureSeller(sellerId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, sellerId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private normalizeImages(images: CreateProductDto['images']) {
    const primaryIndex = images?.findIndex((image) => image.isPrimary) ?? -1;

    return images?.map((image, index) => ({
      url: image.url,
      key: image.key,
      alt: image.alt,
      sortOrder: image.sortOrder ?? index,
      isPrimary: primaryIndex >= 0 ? image.isPrimary === true : index === 0,
    }));
  }

  private async createUniqueSlug(
    value: string,
    ignoreProductId?: string,
  ): Promise<string> {
    const baseSlug = this.slugify(value);
    let slug = baseSlug;
    let suffix = 1;

    while (
      await this.prisma.product.findFirst({
        where: {
          slug,
          ...(ignoreProductId ? { id: { not: ignoreProductId } } : {}),
        },
      })
    ) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    return slug;
  }

  private slugify(value: string): string {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'product'
    );
  }

  private resolveSortOrder(sort?: string) {
    switch (sort) {
      case 'price_asc':
        return { price: 'asc' as const };
      case 'price_desc':
        return { price: 'desc' as const };
      case 'views':
        return { viewCount: 'desc' as const };
      case 'boosted':
        return [
          { isBoosted: 'desc' as const },
          { boostedUntil: 'desc' as const },
          { createdAt: 'desc' as const },
        ];
      default:
        return { createdAt: 'desc' as const };
    }
  }

  private async autoDelistExpiredProducts() {
    const now = new Date();
    await this.prisma.product.updateMany({
      where: {
        status: ProductStatus.ACTIVE,
        expiresAt: { lte: now },
      },
      data: { status: ProductStatus.ARCHIVED },
    });
  }
}
