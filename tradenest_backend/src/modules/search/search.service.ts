import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { ProductStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchQueryDto, SearchSort } from './dto/search-query.dto';

@Injectable()
export class SearchService {
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
  };

  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchQueryDto, userId?: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const searchTerm = query.q?.trim();
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.condition ? { condition: query.condition } : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
      ...(searchTerm
        ? {
            OR: [
              { title: { contains: searchTerm, mode: 'insensitive' } },
              { description: { contains: searchTerm, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: this.productInclude,
        orderBy: this.getOrderBy(query.sort),
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
      searchTerm ? this.trackQuery(searchTerm, userId) : Promise.resolve(),
    ]);

    return {
      message: 'Search results retrieved',
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async autocomplete(q?: string) {
    const searchTerm = q?.trim();

    if (!searchTerm) {
      return { message: 'Autocomplete suggestions retrieved', data: [] };
    }

    const products = await this.prisma.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        OR: [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { description: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        title: true,
        slug: true,
        price: true,
        currency: true,
        category: { select: { id: true, name: true, slug: true } },
        images: {
          orderBy: [
            { isPrimary: 'desc' },
            { sortOrder: 'asc' },
            { createdAt: 'asc' },
          ],
          take: 1,
        },
      },
      orderBy: [{ viewCount: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });

    return {
      message: 'Autocomplete suggestions retrieved',
      data: products,
    };
  }

  async trending() {
    const queries = await this.prisma.searchQuery.groupBy({
      by: ['query'],
      _sum: { hitCount: true },
      _count: { query: true },
      orderBy: { _sum: { hitCount: 'desc' } },
      take: 10,
    });

    return {
      message: 'Trending searches retrieved',
      data: queries.map((query) => ({
        query: query.query,
        hitCount: query._sum.hitCount ?? query._count.query,
      })),
    };
  }

  async recent(userId: string) {
    const queries = await this.prisma.searchQuery.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    return {
      message: 'Recent searches retrieved',
      data: queries,
    };
  }

  private getOrderBy(
    sort?: SearchSort,
  ): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case SearchSort.PRICE_ASC:
        return [{ price: 'asc' }, { createdAt: 'desc' }];
      case SearchSort.PRICE_DESC:
        return [{ price: 'desc' }, { createdAt: 'desc' }];
      case SearchSort.POPULAR:
        return [{ viewCount: 'desc' }, { createdAt: 'desc' }];
      case SearchSort.NEWEST:
      case SearchSort.RELEVANCE:
      default:
        return [{ isBoosted: 'desc' }, { createdAt: 'desc' }];
    }
  }

  private async trackQuery(query: string, userId?: string) {
    const normalizedQuery = query.toLowerCase();
    const existingQuery = await this.prisma.searchQuery.findFirst({
      where: {
        query: normalizedQuery,
        userId: userId ?? null,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existingQuery) {
      return this.prisma.searchQuery.update({
        where: { id: existingQuery.id },
        data: { hitCount: { increment: 1 } },
      });
    }

    return this.prisma.searchQuery.create({
      data: {
        query: normalizedQuery,
        userId,
      },
    });
  }
}
