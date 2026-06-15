import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StorageService } from '@cube/storage';
import { PRODUCT_EVENTS, paginationHelper } from '@cube/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto, ProductSortBy } from './dto/query-product.dto';
import slugify from 'slugify';

/** Shape pushed to RabbitMQ / Elasticsearch */
export interface ProductDocument {
  id: string;
  sku: string;
  name: string;
  description: string;
  brandName: string;
  categoryNames: string[];
  price: number;
  status: string;
  avgRating: number;
  reviewCount: number;
  inStock: boolean;
  createdAt: string;
}

const PRODUCT_INCLUDE = {
  brand: true,
  images: { orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }] },
  categories: { include: { category: true } },
  _count: { select: { reviews: true } },
} as const;

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    @Inject('PRODUCT_EVENTS_QUEUE') private readonly eventClient: ClientProxy,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Create
  // ─────────────────────────────────────────────────────────────────────────

  async create(dto: CreateProductDto) {
    // Validate brand
    const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
    if (!brand) throw new NotFoundException(`Brand ${dto.brandId} not found.`);

    // Validate SKU uniqueness
    const existingSku = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
    if (existingSku) throw new ConflictException(`SKU "${dto.sku}" is already in use.`);

    // Generate unique slug
    const slug = await this.generateUniqueSlug(dto.name);

    // Validate categories
    if (dto.categoryIds?.length) {
      await this.validateCategoryIds(dto.categoryIds);
    }

    const product = await this.prisma.product.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        slug,
        description: dto.description,
        price: dto.price,
        brandId: dto.brandId,
        metadata: dto.metadata ?? {},
        categories: dto.categoryIds?.length
          ? {
              create: dto.categoryIds.map((categoryId) => ({ categoryId })),
            }
          : undefined,
      },
      include: PRODUCT_INCLUDE,
    });

    await this.publishEvent(PRODUCT_EVENTS.CREATED, product);
    return product;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Read
  // ─────────────────────────────────────────────────────────────────────────

  async findAll(query: QueryProductDto) {
    const { page, limit, skip } = paginationHelper.calculatePagination({
      page: query.page,
      limit: query.limit,
    });

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.brandId) where.brandId = query.brandId;
    if (query.categoryId) {
      where.categories = { some: { categoryId: query.categoryId } };
    }
    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      where.price = {};
      if (query.priceMin !== undefined) where.price.gte = query.priceMin;
      if (query.priceMax !== undefined) where.price.lte = query.priceMax;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy = this.buildOrderBy(query.sortBy);

    const [total, data] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: PRODUCT_INCLUDE,
      }),
    ]);

    return { meta: { page, limit, total }, data };
  }

  /** Internal endpoint used as search-service PostgreSQL fallback */
  async internalSearch(query: { search?: string; page?: number; limit?: number }) {
    const { page, limit, skip } = paginationHelper.calculatePagination(query);
    const where: any = { status: 'ACTIVE' };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const products = await this.prisma.product.findMany({
      where,
      skip,
      take: limit,
      include: PRODUCT_INCLUDE,
    });
    return { products, fallback: true };
  }

  async findOne(idOrSlug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw new NotFoundException(`Product "${idOrSlug}" not found.`);
    }
    return product;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Update
  // ─────────────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.findOne(id);

    if (dto.brandId && dto.brandId !== existing.brandId) {
      const brand = await this.prisma.brand.findUnique({ where: { id: dto.brandId } });
      if (!brand) throw new NotFoundException(`Brand ${dto.brandId} not found.`);
    }

    const data: any = {
      ...(dto.name && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.price !== undefined && { price: dto.price }),
      ...(dto.brandId && { brandId: dto.brandId }),
      ...(dto.metadata && { metadata: dto.metadata }),
    };

    if (dto.name) {
      data.slug = await this.generateUniqueSlug(dto.name, id);
    }

    // Replace categories if provided
    if (dto.categoryIds !== undefined) {
      if (dto.categoryIds.length) {
        await this.validateCategoryIds(dto.categoryIds);
      }
      await this.prisma.productCategory.deleteMany({ where: { productId: id } });
      if (dto.categoryIds.length) {
        await this.prisma.productCategory.createMany({
          data: dto.categoryIds.map((categoryId) => ({ productId: id, categoryId })),
        });
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data,
      include: PRODUCT_INCLUDE,
    });

    await this.publishEvent(PRODUCT_EVENTS.UPDATED, product);
    return product;
  }

  async updateStatus(id: string, status: string) {
    const validStatuses = ['DRAFT', 'ACTIVE', 'DISCONTINUED'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Allowed values: ${validStatuses.join(', ')}`,
      );
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { status: status as any },
      include: PRODUCT_INCLUDE,
    });

    await this.publishEvent(PRODUCT_EVENTS.STATUS_CHANGED, product);
    return product;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────────────────────────────────

  async remove(id: string) {
    const product = await this.findOne(id);

    // Delete all images from S3 first
    for (const image of product.images) {
      await this.storageService.delete(image.url).catch(() => {});
      await this.storageService.delete(image.thumbSmUrl).catch(() => {});
      await this.storageService.delete(image.thumbMdUrl).catch(() => {});
    }

    await this.prisma.product.delete({ where: { id } });

    this.eventClient.emit(PRODUCT_EVENTS.DELETED, { id });
    return { message: 'Product deleted successfully.' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Image Management
  // ─────────────────────────────────────────────────────────────────────────

  async uploadImages(productId: string, files: Express.Multer.File[]) {
    await this.findOne(productId);

    const existingCount = await this.prisma.productImage.count({
      where: { productId },
    });

    const results: any[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sortOrder = existingCount + i;

      // Upload original (max 2048px WebP)
      const original = await this.storageService.upload(file.buffer, {
        folder: `products/${productId}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        imagePreset: 'image',
      });

      // Upload thumbnail-sm (200×200)
      const thumbSm = await this.storageService.upload(file.buffer, {
        folder: `products/${productId}/thumbs`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        imagePreset: 'thumbnail-sm',
      });

      // Upload thumbnail-md (400×400)
      const thumbMd = await this.storageService.upload(file.buffer, {
        folder: `products/${productId}/thumbs`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        imagePreset: 'thumbnail-md',
      });

      // First image is primary if none exist
      const isPrimary = sortOrder === 0 && existingCount === 0;

      const image = await this.prisma.productImage.create({
        data: {
          productId,
          url: original.url,
          thumbSmUrl: thumbSm.url,
          thumbMdUrl: thumbMd.url,
          isPrimary,
          sortOrder,
        },
      });
      results.push(image);
    }

    // Publish update to refresh search index
    const product = await this.findOne(productId);
    await this.publishEvent(PRODUCT_EVENTS.UPDATED, product);

    return results;
  }

  async deleteImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) throw new NotFoundException(`Image ${imageId} not found on product.`);

    await this.storageService.delete(image.url).catch(() => {});
    await this.storageService.delete(image.thumbSmUrl).catch(() => {});
    await this.storageService.delete(image.thumbMdUrl).catch(() => {});

    await this.prisma.productImage.delete({ where: { id: imageId } });

    // If deleted was primary, promote the next one
    if (image.isPrimary) {
      const next = await this.prisma.productImage.findFirst({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
      });
      if (next) {
        await this.prisma.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { message: 'Image deleted successfully.' };
  }

  async setPrimaryImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) throw new NotFoundException(`Image ${imageId} not found on product.`);

    // Clear existing primary, then set new one
    await this.prisma.$transaction([
      this.prisma.productImage.updateMany({
        where: { productId },
        data: { isPrimary: false },
      }),
      this.prisma.productImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      }),
    ]);

    return { message: 'Primary image updated successfully.' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = slugify(name, { lower: true, strict: true, trim: true });
    let slug = base;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.product.findFirst({
        where: { slug, ...(excludeId && { NOT: { id: excludeId } }) },
      });
      if (!existing) return slug;
      slug = `${base}-${counter++}`;
    }
  }

  private async validateCategoryIds(ids: string[]): Promise<void> {
    const found = await this.prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      const foundIds = found.map((c) => c.id);
      const missing = ids.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(`Categories not found: ${missing.join(', ')}`);
    }
  }

  private buildOrderBy(sortBy?: ProductSortBy): any {
    switch (sortBy) {
      case ProductSortBy.PRICE_ASC:
        return { price: 'asc' };
      case ProductSortBy.PRICE_DESC:
        return { price: 'desc' };
      case ProductSortBy.NAME:
        return { name: 'asc' };
      default:
        return { createdAt: 'desc' };
    }
  }

  async buildProductDocument(product: any): Promise<ProductDocument> {
    const reviews = await this.prisma.productReview.findMany({
      where: { productId: product.id, status: 'APPROVED' },
      select: { rating: true },
    });
    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description ?? '',
      brandName: product.brand?.name ?? '',
      categoryNames: product.categories?.map((pc: any) => pc.category?.name).filter(Boolean) ?? [],
      price: Number(product.price),
      status: product.status,
      avgRating: Math.round(avgRating * 10) / 10,
      reviewCount: reviews.length,
      inStock: product.status === 'ACTIVE',
      createdAt: product.createdAt.toISOString(),
    };
  }

  private async publishEvent(event: string, product: any): Promise<void> {
    try {
      const doc = await this.buildProductDocument(product);
      this.eventClient.emit(event, doc);
    } catch (err: any) {
      this.logger.warn(`Failed to emit ${event} event: ${err.message}`);
    }
  }
}
