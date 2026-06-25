import slugify from "slugify";
import { ProductSortBy, QueryProductDto } from "../dto/query-product.dto";

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
  images: {
    orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }],
  },
  categories: { include: { category: true } },
  _count: { select: { reviews: true } },
} as const;

export function generateSlug(name: string): string {
  return slugify(name, { lower: true, strict: true, trim: true });
}

export function buildOrderBy(sortBy?: ProductSortBy): any {
  switch (sortBy) {
    case ProductSortBy.PRICE_ASC:
      return { price: "asc" };
    case ProductSortBy.PRICE_DESC:
      return { price: "desc" };
    case ProductSortBy.NAME:
      return { name: "asc" };
    default:
      return { createdAt: "desc" };
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
      { name: { contains: query.search, mode: "insensitive" } },
      { sku: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }
  return where;
}

export function buildInternalSearchWhereClause(query: {
  search?: string;
}): any {
  const where: any = { status: "ACTIVE" };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { sku: { contains: query.search, mode: "insensitive" } },
    ];
  }
  return where;
}
