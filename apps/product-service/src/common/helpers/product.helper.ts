import { NotFoundException } from '@nestjs/common';
import { ProductSortBy, QueryProductDto } from '../../modules/product/dto/query-product.dto';

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

export const PRODUCT_INCLUDE = {
  brand: true,
  images: { orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }] },
  categories: { include: { category: true } },
  _count: { select: { reviews: true } },
} as const;

export function buildOrderBy(sortBy?: ProductSortBy): any {
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

export function buildWhereClause(query: QueryProductDto): any {
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
  return where;
}

export function buildInternalSearchWhereClause(query: { search?: string }): any {
  const where: any = { status: 'ACTIVE' };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { sku: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function validateCategoryIds(
  prisma: any,
  ids: string[],
): Promise<void> {
  const found = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    const foundIds = found.map((c) => c.id);
    const missing = ids.filter((id) => !foundIds.includes(id));
    throw new NotFoundException(`Categories not found: ${missing.join(', ')}`);
  }
}

export async function buildProductDocument(
  prisma: any,
  product: any,
): Promise<ProductDocument> {
  const reviews = await prisma.productReview.findMany({
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

export async function generateUniqueSku(
  prisma: any,
  brandName: string,
  productName: string,
  metadata?: Record<string, any>,
): Promise<string> {
  // 1. Brand part: 3 characters (e.g., "Samsung" -> "SAM")
  const brandClean = brandName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const brandPart = brandClean.substring(0, 3);

  // 2. Product part: up to 5 characters (e.g., "Galaxy S24 Ultra" -> "GS24U" using word initials + digits)
  const cleanProd = productName.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
  const words = cleanProd.split(/\s+/).filter(Boolean);
  
  let productPart = '';
  if (words.length === 1) {
    productPart = words[0].substring(0, 5);
  } else {
    productPart = words
      .map((w) => {
        if (/\d/.test(w)) return w; // Keep digits/model numbers (e.g., S24, 15)
        return w[0]; // Take initial of words
      })
      .join('')
      .substring(0, 5);
  }

  // Combine with a hyphen for professional readability (e.g. SAM-GS24U)
  const baseSku = `${brandPart}-${productPart}`.toUpperCase();

  let finalSku = baseSku.substring(0, 9); // Safe starting limit (max 9 chars)
  let counter = 1;

  while (true) {
    const existing = await prisma.product.findUnique({
      where: { sku: finalSku },
    });
    if (!existing) return finalSku;
    
    const suffix = `${counter++}`;
    finalSku = baseSku.substring(0, 10 - suffix.length) + suffix;
  }
}





