import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { PRODUCT_EVENTS } from "@cube/common";
import {
  PRODUCT_INCLUDE,
  ProductDocument,
  generateSlug,
  resolveCoverImage,
} from "../utils/product.utils";

@Injectable()
export class ProductHelper {
  private readonly logger = new Logger(ProductHelper.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject("PRODUCT_EVENTS_QUEUE") private readonly eventClient: ClientProxy,
  ) {}

  async buildProductDocument(product: any): Promise<ProductDocument> {
    const reviews = await this.prisma.productReview.findMany({
      where: { productId: product.id, status: "APPROVED" },
      select: { rating: true },
    });
    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    const variants = product.variants || [];
    const variantSkus = variants.map((v: any) => v.sku);
    const variantAttributes = variants.flatMap((v: any) =>
      Object.entries(v.attributes || {}).map(([key, val]) => `${key}: ${val}`),
    );

    const prices = variants.map((v: any) => Number(v.price));
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;

    const coverImage = resolveCoverImage(product);

    return {
      id: product.id,
      name: product.name,
      description: product.description ?? "",
      brandName: product.brand?.name ?? "",
      categoryNames:
        product.categories
          ?.map((pc: any) => pc.category?.name)
          .filter(Boolean) ?? [],
      colorNames: (product.colors ?? []).map((c: any) => c.name),
      coverImageUrl: coverImage?.url ?? null,
      status: product.status,
      avgRating: Math.round(avgRating * 10) / 10,
      reviewCount: reviews.length,
      inStock: product.status === "ACTIVE",
      createdAt: product.createdAt.toISOString(),
      variantSkus,
      variantAttributes,
      minPrice,
      maxPrice,
    };
  }

  async syncProductsByBrand(brandId: string): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { brandId },
      include: PRODUCT_INCLUDE,
    });
    for (const product of products) {
      await this.publishEvent(PRODUCT_EVENTS.UPDATED, product);
    }
  }

  async syncProductsByCategory(categoryId: string): Promise<void> {
    const products = await this.prisma.product.findMany({
      where: { categories: { some: { categoryId } } },
      include: PRODUCT_INCLUDE,
    });
    for (const product of products) {
      await this.publishEvent(PRODUCT_EVENTS.UPDATED, product);
    }
  }

  async publishEvent(event: string, product: any): Promise<void> {
    try {
      const doc = await this.buildProductDocument(product);
      this.eventClient.emit(event, doc);
    } catch (err: any) {
      this.logger.warn(`Failed to emit ${event} event: ${err.message}`);
    }
  }

  emit(event: string, data: any): void {
    this.eventClient.emit(event, data);
  }

  async generateUniqueSku(
    tx: any,
    brandName: string,
    productName: string,
    metadata?: Record<string, any>,
    excludeSkus?: Set<string>,
  ): Promise<string> {
    const brandClean = brandName.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const brandPart = brandClean.substring(0, 3);

    const cleanProd = productName
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, "")
      .trim();
    const words = cleanProd.split(/\s+/).filter(Boolean);

    let productPart = "";
    if (words.length === 1) {
      productPart = words[0].substring(0, 5);
    } else {
      productPart = words
        .map((w) => {
          if (/\d/.test(w)) return w;
          return w[0];
        })
        .join("")
        .substring(0, 5);
    }

    const baseSku = `${brandPart}-${productPart}`.toUpperCase();

    let finalSku = baseSku.substring(0, 9);
    let counter = 1;

    while (true) {
      const existingVariant = await tx.productVariant.findUnique({
        where: { sku: finalSku },
      });
      const isExcluded = excludeSkus && excludeSkus.has(finalSku);
      if (!existingVariant && !isExcluded) {
        if (excludeSkus) {
          excludeSkus.add(finalSku);
        }
        return finalSku;
      }

      const suffix = `${counter++}`;
      finalSku = baseSku.substring(0, 10 - suffix.length) + suffix;
    }
  }

  async generateUniqueSlug(
    tx: any,
    name: string,
    excludeId?: string,
  ): Promise<string> {
    const base = generateSlug(name);
    let slug = base;
    let counter = 1;

    while (true) {
      const existing = await tx.product.findFirst({
        where: { slug, ...(excludeId && { NOT: { id: excludeId } }) },
      });
      if (!existing) return slug;
      slug = `${base}-${counter++}`;
    }
  }
}
