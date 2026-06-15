import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import slugify from 'slugify';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Create
  // ─────────────────────────────────────────────────────────────────────────

  async create(dto: CreateCategoryDto) {
    const slug = this.generateSlug(dto.name);

    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException('A category with this name already exists.');
    }

    let level = 0;
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(`Parent category ${dto.parentId} not found.`);
      }
      level = parent.level + 1;
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        parentId: dto.parentId ?? null,
        level,
      },
      include: { parent: true },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Read
  // ─────────────────────────────────────────────────────────────────────────

  /** Returns full tree — root categories with their children recursively. */
  async findAll() {
    const all = await this.prisma.category.findMany({
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return this.buildTree(all);
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        _count: { select: { products: true } },
      },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found.`);
    }
    return category;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Update — with circular reference guard (spec 2.2)
  // ─────────────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent.');
      }
      await this.guardCircularReference(id, dto.parentId);
    }

    const data: any = {};
    if (dto.name) {
      const slug = this.generateSlug(dto.name);
      const conflict = await this.prisma.category.findFirst({
        where: { slug, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException('A category with this name already exists.');
      }
      data.name = dto.name;
      data.slug = slug;
    }

    if (dto.parentId !== undefined) {
      data.parentId = dto.parentId ?? null;
      if (dto.parentId) {
        const parent = await this.prisma.category.findUnique({
          where: { id: dto.parentId },
        });
        data.level = (parent?.level ?? 0) + 1;
      } else {
        data.level = 0;
      }
    }

    return this.prisma.category.update({
      where: { id },
      data,
      include: { parent: true },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────────────────────────────────

  async remove(id: string) {
    await this.findOne(id);

    const childCount = await this.prisma.category.count({
      where: { parentId: id },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        `Cannot delete — category has ${childCount} child category(s). Remove or reparent them first.`,
      );
    }

    const productCount = await this.prisma.productCategory.count({
      where: { categoryId: id },
    });
    if (productCount > 0) {
      throw new BadRequestException(
        `Cannot delete — category is assigned to ${productCount} product(s). Reassign them first.`,
      );
    }

    await this.prisma.category.delete({ where: { id } });
    return { message: 'Category deleted successfully.' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Circular reference guard (spec 2.2)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Walk up the ancestor chain from `parentId`. If we encounter `id` at any
   * point, the assignment would create a cycle — throw BadRequestException.
   */
  private async guardCircularReference(
    id: string,
    parentId: string | null,
  ): Promise<void> {
    let current = parentId;
    while (current) {
      if (current === id) {
        throw new BadRequestException('Circular category reference detected.');
      }
      const parent = await this.prisma.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = parent?.parentId ?? null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private generateSlug(name: string): string {
    return slugify(name, { lower: true, strict: true, trim: true });
  }

  private buildTree(categories: any[]): any[] {
    const map = new Map<string, any>();
    categories.forEach((c) => map.set(c.id, { ...c, children: [] }));

    const roots: any[] = [];
    map.forEach((cat) => {
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId).children.push(cat);
      } else {
        roots.push(cat);
      }
    });
    return roots;
  }
}
