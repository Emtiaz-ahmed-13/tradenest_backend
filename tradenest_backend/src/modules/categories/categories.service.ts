import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  children: CategoryNode[];
};

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    await this.ensureParentExists(dto.parentId);

    const slug = await this.createUniqueSlug(dto.slug ?? dto.name);

    try {
      const category = await this.prisma.category.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          image: dto.image,
          parentId: dto.parentId,
          commissionRate: dto.commissionRate ?? 0,
        },
      });

      return {
        message: 'Category created',
        data: category,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Category slug already exists');
      }

      throw error;
    }
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            children: true,
            products: true,
          },
        },
      },
    });

    return {
      message: 'Categories retrieved',
      data: categories,
    };
  }

  async findTree() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });

    return {
      message: 'Category tree retrieved',
      data: this.buildTree(categories),
    };
  }

  async findOne(idOrSlug: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        parent: true,
        children: {
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return {
      message: 'Category retrieved',
      data: category,
    };
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existingCategory = await this.ensureCategoryExists(id);

    if (dto.parentId === id) {
      throw new BadRequestException('Category cannot be its own parent');
    }

    await this.ensureParentExists(dto.parentId);

    const data = {
      name: dto.name,
      slug: dto.slug
        ? await this.createUniqueSlug(dto.slug, existingCategory.id)
        : undefined,
      description: dto.description,
      image: dto.image,
      parentId: dto.parentId,
    };

    try {
      const category = await this.prisma.category.update({
        where: { id },
        data,
      });

      return {
        message: 'Category updated',
        data: category,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Category slug already exists');
      }

      throw error;
    }
  }

  async remove(id: string) {
    await this.ensureCategoryExists(id);

    const [childrenCount, productsCount] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id } }),
      this.prisma.product.count({ where: { categoryId: id } }),
    ]);

    if (childrenCount > 0 || productsCount > 0) {
      throw new BadRequestException(
        'Category with children or products cannot be deleted',
      );
    }

    await this.prisma.category.delete({ where: { id } });

    return {
      message: 'Category deleted',
      data: { id },
    };
  }

  private buildTree(
    categories: Omit<CategoryNode, 'children'>[],
  ): CategoryNode[] {
    const nodes = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const category of categories) {
      nodes.set(category.id, { ...category, children: [] });
    }

    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private async ensureCategoryExists(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  private async ensureParentExists(parentId?: string): Promise<void> {
    if (!parentId) {
      return;
    }

    await this.ensureCategoryExists(parentId);
  }

  private async createUniqueSlug(
    value: string,
    ignoreCategoryId?: string,
  ): Promise<string> {
    const baseSlug = this.slugify(value);
    let slug = baseSlug;
    let suffix = 1;

    while (
      await this.prisma.category.findFirst({
        where: {
          slug,
          ...(ignoreCategoryId ? { id: { not: ignoreCategoryId } } : {}),
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
        .replace(/^-+|-+$/g, '') || 'category'
    );
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
