import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { StorageService } from "@cube/storage";
import { PRODUCT_EVENTS, paginationHelper, UserRole, JwtUser } from "@cube/common";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { QueryProductDto } from "./dto/query-product.dto";
import { CreateBulkProductsDto } from "./dto/create-bulk.dto";
import { CreateProductVariantDto } from "./dto/create-variant.dto";
import { CreateProductColorDto } from "./dto/create-color.dto";
import { UpdateProductColorDto } from "./dto/update-color.dto";
import { ProductStatus } from "../../../prisma/generated/prisma/enums";
import {
  buildOrderBy,
  buildWhereClause,
  buildInternalSearchWhereClause,
  PRODUCT_INCLUDE,
} from "./utils/product.utils";
import { validateCategoryIds } from "../category/helpers/category.helper";
import { ProductHelper } from "./helpers/product.helper";

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly productHelper: ProductHelper,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Create
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resolves a variant's colorTempKey/colorId against the map of colors
   * available in the current request (newly created and/or surviving
   * existing colors, keyed by both tempKey/name and real id).
   */
  private resolveVariantColorId(
    v: CreateProductVariantDto,
    colorKeyToId: Map<string, string>,
    index: number,
  ): string {
    const key = v.colorTempKey ?? v.colorId;
    const colorId = key ? colorKeyToId.get(key) : undefined;
    if (!colorId) {
      throw new BadRequestException(
        `Variant ${index} does not reference a valid color (use colorTempKey for a color created in the same request, or colorId for an existing color).`,
      );
    }
    return colorId;
  }

  /** Shared by create() and createBulk() — creates one product + its colors + variants inside an open transaction. */
  private async createProductInTx(
    tx: any,
    dto: CreateProductDto,
    generatedSkus: Set<string>,
  ) {
    const brand = await tx.brand.findUnique({ where: { id: dto.brandId } });
    if (!brand) throw new NotFoundException(`Brand ${dto.brandId} not found.`);

    if (dto.categoryIds?.length) {
      await validateCategoryIds(tx, dto.categoryIds);
    }

    const slug = await this.productHelper.generateUniqueSlug(tx, dto.name);

    // Step 1: bare product shell (colors/variants need a real productId first)
    const p = await tx.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        specifications: dto.specifications ?? undefined,
        brandId: dto.brandId,
        metadata: dto.metadata ?? {},
        categories: dto.categoryIds?.length
          ? { create: dto.categoryIds.map((categoryId) => ({ categoryId })) }
          : undefined,
      },
    });

    // Step 2: colors — build a tempKey/name -> id map for variant resolution
    const colorKeyToId = new Map<string, string>();
    for (let i = 0; i < dto.colors.length; i++) {
      const c = dto.colors[i];
      let created: { id: string };
      try {
        created = await tx.productColor.create({
          data: {
            productId: p.id,
            name: c.name,
            hexCode: c.hexCode,
            sortOrder: c.sortOrder ?? i,
          },
        });
      } catch (err: any) {
        if (err.code === "P2002") {
          throw new ConflictException(
            `Color "${c.name}" already exists on this product.`,
          );
        }
        throw err;
      }
      colorKeyToId.set(c.tempKey ?? c.name, created.id);
      colorKeyToId.set(created.id, created.id);
      if (c.imageIds?.length) {
        await tx.productImage.updateMany({
          where: { id: { in: c.imageIds } },
          data: { colorId: created.id, productId: p.id },
        });
      }
    }

    // Step 3: variants
    const explicitDefaults = dto.variants.filter((v) => v.isDefault).length;
    if (explicitDefaults > 1) {
      throw new BadRequestException(
        "Only one variant may be marked as default.",
      );
    }

    for (let i = 0; i < dto.variants.length; i++) {
      const v = dto.variants[i];
      const colorId = this.resolveVariantColorId(v, colorKeyToId, i);

      let variantSku = v.sku;
      if (!variantSku) {
        const attrStr = Object.values(v.attributes ?? {}).join(" ");
        variantSku = await this.productHelper.generateUniqueSku(
          tx,
          brand.name,
          `${dto.name} ${attrStr}`,
          dto.metadata,
          generatedSkus,
        );
      } else {
        const existingVariantSku = await tx.productVariant.findUnique({
          where: { sku: variantSku },
        });
        const isDuplicate =
          existingVariantSku || generatedSkus.has(variantSku);
        if (isDuplicate)
          throw new ConflictException(
            `Variant SKU "${variantSku}" is already in use.`,
          );
        generatedSkus.add(variantSku);
      }

      await tx.productVariant.create({
        data: {
          productId: p.id,
          colorId,
          sku: variantSku,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          attributes: v.attributes ?? {},
          isDefault: v.isDefault ?? (explicitDefaults === 0 && i === 0),
          isActive: v.isActive ?? true,
        },
      });
    }

    return tx.product.findUnique({
      where: { id: p.id },
      include: PRODUCT_INCLUDE,
    });
  }

  async create(dto: CreateProductDto) {
    const product = await this.prisma.$transaction(async (tx) => {
      return this.createProductInTx(tx, dto, new Set<string>());
    });

    await this.productHelper.publishEvent(PRODUCT_EVENTS.CREATED, product);
    return product;
  }

  async createBulk(dto: CreateBulkProductsDto) {
    const products = await this.prisma.$transaction(async (tx) => {
      const generatedSkus = new Set<string>();
      const created = [];
      for (const productDto of dto.products) {
        created.push(
          await this.createProductInTx(tx, productDto, generatedSkus),
        );
      }
      return created;
    });

    for (const product of products) {
      await this.productHelper.publishEvent(PRODUCT_EVENTS.CREATED, product);
    }

    return products;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Read
  // ─────────────────────────────────────────────────────────────────────────

  async findAll(query: QueryProductDto, user?: JwtUser) {
    const { page, limit, skip } = paginationHelper.calculatePagination({
      page: query.page,
      limit: query.limit,
    });

    const isStaff = user && [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT].includes(user.role as UserRole);

    const where = buildWhereClause(query);
    if (!isStaff) {
      if (query.status === ProductStatus.DRAFT) {
        throw new ForbiddenException("You do not have permission to view draft products.");
      }
      where.status = query.status ? query.status : { in: [ProductStatus.ACTIVE, ProductStatus.DISCONTINUED] };
    } else {
      if (query.status) {
        where.status = query.status;
      }
    }

    const orderBy = buildOrderBy(query.sortBy);
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
  async internalSearch(query: {
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { page, limit, skip } = paginationHelper.calculatePagination(query);
    const where = buildInternalSearchWhereClause(query);
    const products = await this.prisma.product.findMany({
      where,
      skip,
      take: limit,
      include: PRODUCT_INCLUDE,
    });
    return { products, fallback: true };
  }

  async findOneBySlug(slug: string, user?: JwtUser) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw new NotFoundException(`Product with slug "${slug}" not found.`);
    }

    const isStaff = user && [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT].includes(user.role as UserRole);
    if (!isStaff && product.status === ProductStatus.DRAFT) {
      throw new NotFoundException(`Product with slug "${slug}" not found.`);
    }

    return product;
  }

  // Kept for internal update/delete checks
  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found.`);
    }
    return product;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Update
  // ─────────────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { brand: true, variants: true, colors: true },
    });
    if (!existing) throw new NotFoundException(`Product with ID "${id}" not found.`);

    let brand = existing.brand;
    if (dto.brandId && dto.brandId !== existing.brandId) {
      const newBrand = await this.prisma.brand.findUnique({
        where: { id: dto.brandId },
      });
      if (!newBrand)
        throw new NotFoundException(`Brand ${dto.brandId} not found.`);
      brand = newBrand;
    }

    const data: any = {
      ...(dto.name && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.specifications !== undefined && {
        specifications: dto.specifications,
      }),
      ...(dto.brandId && { brandId: dto.brandId }),
      ...(dto.metadata && { metadata: dto.metadata }),
    };

    const product = await this.prisma.$transaction(async (tx) => {
      if (dto.name) {
        data.slug = await this.productHelper.generateUniqueSlug(
          tx,
          dto.name,
          id,
        );
      }

      if (dto.categoryIds !== undefined) {
        if (dto.categoryIds.length) {
          await validateCategoryIds(tx, dto.categoryIds);
        }
        await tx.productCategory.deleteMany({ where: { productId: id } });
        if (dto.categoryIds.length) {
          await tx.productCategory.createMany({
            data: dto.categoryIds.map((categoryId) => ({
              productId: id,
              categoryId,
            })),
          });
        }
      }

      const generatedSkus = new Set<string>();
      existing.variants.forEach((v) => generatedSkus.add(v.sku));

      // ── Sync colors first (variants below may reference newly-created colors) ──
      const colorKeyToId = new Map<string, string>();

      if (dto.colors !== undefined) {
        const existingColorIds = existing.colors.map((c) => c.id);
        const incomingColorIds = dto.colors
          .map((c) => c.id)
          .filter((cid): cid is string => Boolean(cid));

        const toDeleteColorIds = existingColorIds.filter(
          (cid) => !incomingColorIds.includes(cid),
        );
        if (toDeleteColorIds.length) {
          const orphanedVariants = await tx.productVariant.count({
            where: { colorId: { in: toDeleteColorIds } },
          });
          const survivingVariants = await tx.productVariant.count({
            where: {
              productId: id,
              colorId: { notIn: toDeleteColorIds },
            },
          });
          if (orphanedVariants > 0 && survivingVariants === 0) {
            throw new BadRequestException(
              "Cannot delete the only color(s) with variants — a product must have at least one variant.",
            );
          }
          await tx.productColor.deleteMany({
            where: { id: { in: toDeleteColorIds } },
          });
        }

        for (let i = 0; i < dto.colors.length; i++) {
          const c = dto.colors[i];
          if (c.id) {
            try {
              await tx.productColor.update({
                where: { id: c.id },
                data: {
                  name: c.name,
                  hexCode: c.hexCode,
                  sortOrder: c.sortOrder ?? i,
                },
              });
            } catch (err: any) {
              if (err.code === "P2002") {
                throw new ConflictException(
                  `Color "${c.name}" already exists on this product.`,
                );
              }
              throw err;
            }
            colorKeyToId.set(c.tempKey ?? c.name, c.id);
            colorKeyToId.set(c.id, c.id);

            if (c.imageIds) {
              await tx.productImage.updateMany({
                where: { colorId: c.id },
                data: { colorId: null },
              });
              if (c.imageIds.length) {
                await tx.productImage.updateMany({
                  where: { id: { in: c.imageIds } },
                  data: { colorId: c.id, productId: id },
                });
              }
            }
          } else {
            let created: { id: string };
            try {
              created = await tx.productColor.create({
                data: {
                  productId: id,
                  name: c.name,
                  hexCode: c.hexCode,
                  sortOrder: c.sortOrder ?? i,
                },
              });
            } catch (err: any) {
              if (err.code === "P2002") {
                throw new ConflictException(
                  `Color "${c.name}" already exists on this product.`,
                );
              }
              throw err;
            }
            colorKeyToId.set(c.tempKey ?? c.name, created.id);
            colorKeyToId.set(created.id, created.id);
            if (c.imageIds?.length) {
              await tx.productImage.updateMany({
                where: { id: { in: c.imageIds } },
                data: { colorId: created.id, productId: id },
              });
            }
          }
        }
      } else {
        for (const c of existing.colors) {
          colorKeyToId.set(c.id, c.id);
        }
      }

      // ── Sync variants ──
      if (dto.variants !== undefined) {
        const existingVariants = existing.variants;
        const existingIds = existingVariants.map((v) => v.id);
        const incomingIds = dto.variants
          .map((v) => v.id)
          .filter((vid): vid is string => Boolean(vid));

        const toDelete = existingIds.filter((eid) => !incomingIds.includes(eid));
        if (toDelete.length > 0) {
          await tx.productVariant.deleteMany({
            where: { id: { in: toDelete } },
          });
        }

        const explicitDefaults = dto.variants.filter((v) => v.isDefault).length;
        if (explicitDefaults > 1) {
          throw new BadRequestException(
            "Only one variant may be marked as default.",
          );
        }

        const resultingVariantIds: string[] = [];

        for (let i = 0; i < dto.variants.length; i++) {
          const v = dto.variants[i];
          const vId = v.id;
          const colorId = this.resolveVariantColorId(v, colorKeyToId, i);

          if (vId) {
            const oldSku = existingVariants.find((ev) => ev.id === vId)?.sku;
            const variantSku = v.sku ?? oldSku!;

            if (variantSku !== oldSku) {
              const duplicate = await tx.productVariant.findFirst({
                where: { sku: variantSku, NOT: { id: vId } },
              });
              const isDuplicate = duplicate || generatedSkus.has(variantSku);
              if (isDuplicate)
                throw new ConflictException(
                  `SKU "${variantSku}" is already in use.`,
                );
            }
            if (oldSku) generatedSkus.delete(oldSku);
            generatedSkus.add(variantSku);

            await tx.productVariant.update({
              where: { id: vId },
              data: {
                colorId,
                sku: variantSku,
                price: v.price,
                attributes: v.attributes,
                ...(v.compareAtPrice !== undefined && {
                  compareAtPrice: v.compareAtPrice,
                }),
                ...(v.isDefault !== undefined && { isDefault: v.isDefault }),
                ...(v.isActive !== undefined && { isActive: v.isActive }),
              },
            });
            resultingVariantIds.push(vId);
          } else {
            let variantSku = v.sku;
            if (!variantSku) {
              const attrStr = Object.values(v.attributes ?? {}).join(" ");
              variantSku = await this.productHelper.generateUniqueSku(
                tx,
                brand.name,
                `${dto.name ?? existing.name} ${attrStr}`,
                dto.metadata ?? existing.metadata,
                generatedSkus,
              );
            } else {
              const duplicate = await tx.productVariant.findUnique({
                where: { sku: variantSku },
              });
              const isDuplicate = duplicate || generatedSkus.has(variantSku);
              if (isDuplicate)
                throw new ConflictException(
                  `Variant SKU "${variantSku}" is already in use.`,
                );
              generatedSkus.add(variantSku);
            }

            const newVariant = await tx.productVariant.create({
              data: {
                productId: id,
                colorId,
                sku: variantSku,
                price: v.price,
                compareAtPrice: v.compareAtPrice,
                attributes: v.attributes,
                isDefault: v.isDefault ?? false,
                isActive: v.isActive ?? true,
              },
            });
            resultingVariantIds.push(newVariant.id);
          }
        }

        if (resultingVariantIds.length === 0) {
          throw new BadRequestException(
            "A product must have at least one variant.",
          );
        }

        const finalDefaultCount = await tx.productVariant.count({
          where: { id: { in: resultingVariantIds }, isDefault: true },
        });
        if (finalDefaultCount === 0) {
          await tx.productVariant.update({
            where: { id: resultingVariantIds[0] },
            data: { isDefault: true },
          });
        } else if (finalDefaultCount > 1) {
          throw new BadRequestException(
            "Only one variant may be marked as default.",
          );
        }
      }

      return tx.product.update({
        where: { id },
        data,
        include: PRODUCT_INCLUDE,
      });
    });

    await this.productHelper.publishEvent(PRODUCT_EVENTS.UPDATED, product);
    return product;
  }

  async updateStatus(id: string, status: ProductStatus) {
    const validStatuses = Object.values(ProductStatus);
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid status. Allowed values: ${validStatuses.join(", ")}`,
      );
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { status },
      include: PRODUCT_INCLUDE,
    });

    await this.productHelper.publishEvent(
      PRODUCT_EVENTS.STATUS_CHANGED,
      product,
    );
    return product;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────────────────────────────────

  async remove(id: string) {
    const product = await this.findOne(id);

    const allImages = [
      ...product.images,
      ...product.colors.flatMap((c) => c.images),
    ];
    for (const image of allImages) {
      await this.storageService.delete(image.url).catch(() => {});
      await this.storageService.delete(image.thumbSmUrl).catch(() => {});
      await this.storageService.delete(image.thumbMdUrl).catch(() => {});
    }

    await this.prisma.product.delete({ where: { id } });

    this.productHelper.emit(PRODUCT_EVENTS.DELETED, { id });
    return { message: "Product deleted successfully." };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Color Management
  // ─────────────────────────────────────────────────────────────────────────

  async createColor(productId: string, dto: CreateProductColorDto) {
    await this.findOne(productId);

    let color: { id: string };
    try {
      color = await this.prisma.productColor.create({
        data: {
          productId,
          name: dto.name,
          hexCode: dto.hexCode,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (err: any) {
      if (err.code === "P2002") {
        throw new ConflictException(
          `Color "${dto.name}" already exists on this product.`,
        );
      }
      throw err;
    }

    if (dto.imageIds?.length) {
      await this.prisma.productImage.updateMany({
        where: { id: { in: dto.imageIds } },
        data: { colorId: color.id, productId },
      });
    }

    const product = await this.findOne(productId);
    await this.productHelper.publishEvent(PRODUCT_EVENTS.UPDATED, product);
    return product.colors.find((c) => c.id === color.id);
  }

  async updateColor(
    productId: string,
    colorId: string,
    dto: UpdateProductColorDto,
  ) {
    const existing = await this.prisma.productColor.findFirst({
      where: { id: colorId, productId },
    });
    if (!existing)
      throw new NotFoundException(`Color ${colorId} not found on this product.`);

    try {
      await this.prisma.productColor.update({
        where: { id: colorId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.hexCode !== undefined && { hexCode: dto.hexCode }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        },
      });
    } catch (err: any) {
      if (err.code === "P2002") {
        throw new ConflictException(
          `Color "${dto.name}" already exists on this product.`,
        );
      }
      throw err;
    }

    if (dto.imageIds) {
      await this.prisma.productImage.updateMany({
        where: { colorId },
        data: { colorId: null },
      });
      if (dto.imageIds.length) {
        await this.prisma.productImage.updateMany({
          where: { id: { in: dto.imageIds } },
          data: { colorId, productId },
        });
      }
    }

    const product = await this.findOne(productId);
    await this.productHelper.publishEvent(PRODUCT_EVENTS.UPDATED, product);
    return product.colors.find((c) => c.id === colorId);
  }

  async removeColor(productId: string, colorId: string) {
    const color = await this.prisma.productColor.findFirst({
      where: { id: colorId, productId },
      include: { images: true },
    });
    if (!color)
      throw new NotFoundException(`Color ${colorId} not found on this product.`);

    const remainingColors = await this.prisma.productColor.count({
      where: { productId },
    });
    if (remainingColors <= 1) {
      throw new BadRequestException(
        "A product must have at least one color.",
      );
    }

    const remainingVariants = await this.prisma.productVariant.count({
      where: { productId, NOT: { colorId } },
    });
    if (remainingVariants === 0) {
      throw new BadRequestException(
        "Cannot delete the only color with variants — a product must have at least one variant.",
      );
    }

    for (const image of color.images) {
      await this.storageService.delete(image.url).catch(() => {});
      await this.storageService.delete(image.thumbSmUrl).catch(() => {});
      await this.storageService.delete(image.thumbMdUrl).catch(() => {});
    }

    await this.prisma.productColor.delete({ where: { id: colorId } });

    const product = await this.findOne(productId);
    await this.productHelper.publishEvent(PRODUCT_EVENTS.UPDATED, product);
    return { message: "Color deleted successfully." };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Image Management
  // ─────────────────────────────────────────────────────────────────────────

  async uploadImages(
    productId: string,
    files: Express.Multer.File[],
    colorId?: string,
  ) {
    await this.findOne(productId);

    if (colorId) {
      const color = await this.prisma.productColor.findFirst({
        where: { id: colorId, productId },
      });
      if (!color)
        throw new NotFoundException(
          `Color ${colorId} not found on this product.`,
        );
    }

    const existingCount = await this.prisma.productImage.count({
      where: { productId, colorId: colorId ?? null },
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
        imagePreset: "image",
      });

      // Upload thumbnail-sm (200×200)
      const thumbSm = await this.storageService.upload(file.buffer, {
        folder: `products/${productId}/thumbs`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        imagePreset: "thumbnail-sm",
      });

      // Upload thumbnail-md (400×400)
      const thumbMd = await this.storageService.upload(file.buffer, {
        folder: `products/${productId}/thumbs`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        imagePreset: "thumbnail-md",
      });

      // First image for this color (or the generic bucket) is primary
      const isPrimary = sortOrder === 0 && existingCount === 0;

      const image = await this.prisma.productImage.create({
        data: {
          productId,
          colorId: colorId ?? null,
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
    await this.productHelper.publishEvent(PRODUCT_EVENTS.UPDATED, product);

    return results;
  }

  async deleteImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image)
      throw new NotFoundException(`Image ${imageId} not found on product.`);

    await this.storageService.delete(image.url).catch(() => {});
    await this.storageService.delete(image.thumbSmUrl).catch(() => {});
    await this.storageService.delete(image.thumbMdUrl).catch(() => {});

    await this.prisma.productImage.delete({ where: { id: imageId } });

    // If deleted was primary, promote the next image within the same color bucket
    if (image.isPrimary) {
      const next = await this.prisma.productImage.findFirst({
        where: { productId, colorId: image.colorId },
        orderBy: { sortOrder: "asc" },
      });
      if (next) {
        await this.prisma.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    // Publish update event to sync search index
    const product = await this.findOne(productId);
    await this.productHelper.publishEvent(PRODUCT_EVENTS.UPDATED, product);

    return { message: "Image deleted successfully." };
  }

  async setPrimaryImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image)
      throw new NotFoundException(`Image ${imageId} not found on product.`);

    // Clear existing primary within the same color bucket, then set new one
    await this.prisma.$transaction([
      this.prisma.productImage.updateMany({
        where: { productId, colorId: image.colorId },
        data: { isPrimary: false },
      }),
      this.prisma.productImage.update({
        where: { id: imageId },
        data: { isPrimary: true },
      }),
    ]);

    // Publish update event to sync search index
    const product = await this.findOne(productId);
    await this.productHelper.publishEvent(PRODUCT_EVENTS.UPDATED, product);

    return { message: "Primary image updated successfully." };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Custom Query Routes
  // ─────────────────────────────────────────────────────────────────────────

  async findAllByBrandSlug(brandSlug: string, query: QueryProductDto, user?: JwtUser) {
    const brand = await this.prisma.brand.findUnique({
      where: { slug: brandSlug },
    });
    if (!brand) throw new NotFoundException(`Brand "${brandSlug}" not found.`);

    const { page, limit, skip } = paginationHelper.calculatePagination({
      page: query.page,
      limit: query.limit,
    });

    const isStaff = user && [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT].includes(user.role as UserRole);

    const where: any = {
      brandId: brand.id,
    };

    if (!isStaff) {
      if (query.status === ProductStatus.DRAFT) {
        throw new ForbiddenException("You do not have permission to view draft products.");
      }
      where.status = query.status ? query.status : { in: [ProductStatus.ACTIVE, ProductStatus.DISCONTINUED] };
    } else {
      if (query.status) {
        where.status = query.status;
      }
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        {
          variants: {
            some: { sku: { contains: query.search, mode: "insensitive" } },
          },
        },
      ];
    }

    const orderBy = buildOrderBy(query.sortBy);

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

  async findAllByCategorySlug(categorySlug: string, query: QueryProductDto, user?: JwtUser) {
    const category = await this.prisma.category.findUnique({
      where: { slug: categorySlug },
    });
    if (!category) throw new NotFoundException(`Category "${categorySlug}" not found.`);

    const { page, limit, skip } = paginationHelper.calculatePagination({
      page: query.page,
      limit: query.limit,
    });

    const isStaff = user && [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT].includes(user.role as UserRole);

    const where: any = {
      categories: { some: { categoryId: category.id } },
    };

    if (!isStaff) {
      if (query.status === ProductStatus.DRAFT) {
        throw new ForbiddenException("You do not have permission to view draft products.");
      }
      where.status = query.status ? query.status : { in: [ProductStatus.ACTIVE, ProductStatus.DISCONTINUED] };
    } else {
      if (query.status) {
        where.status = query.status;
      }
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        {
          variants: {
            some: { sku: { contains: query.search, mode: "insensitive" } },
          },
        },
      ];
    }

    const orderBy = buildOrderBy(query.sortBy);

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

  async findRelatedProducts(slug: string, user?: JwtUser) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: { categories: true },
    });
    if (!product) throw new NotFoundException(`Product with slug "${slug}" not found.`);

    const isStaff = user && [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT].includes(user.role as UserRole);
    if (!isStaff && product.status === ProductStatus.DRAFT) {
      throw new NotFoundException(`Product with slug "${slug}" not found.`);
    }

    const categoryIds = product.categories.map((c) => c.categoryId);

    const where: any = {
      id: { not: product.id },
      OR: [
        { categories: { some: { categoryId: { in: categoryIds } } } },
        { brandId: product.brandId },
      ],
    };

    if (!isStaff) {
      where.status = { in: [ProductStatus.ACTIVE, ProductStatus.DISCONTINUED] };
    }

    const data = await this.prisma.product.findMany({
      where,
      take: 10,
      orderBy: { createdAt: "desc" },
      include: PRODUCT_INCLUDE,
    });

    return data;
  }
}
