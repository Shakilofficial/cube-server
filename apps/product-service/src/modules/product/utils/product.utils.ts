import slugify from "slugify";
import { ProductSortBy, QueryProductDto } from "../dto/query-product.dto";

export interface ProductDocument {
  id: string;
  name: string;
  description: string;
  brandName: string;
  categoryNames: string[];
  colorNames: string[];
  coverImageUrl: string | null;
  status: string;
  avgRating: number;
  reviewCount: number;
  inStock: boolean;
  createdAt: string;
  variantSkus?: string[];
  variantAttributes?: string[];
  minPrice: number;
  maxPrice: number;
}

const IMAGE_ORDER_BY = [
  { isPrimary: "desc" as const },
  { sortOrder: "asc" as const },
];

export const PRODUCT_INCLUDE = {
  brand: true,
  images: { orderBy: IMAGE_ORDER_BY },
  categories: { include: { category: true } },
  colors: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      images: { orderBy: IMAGE_ORDER_BY },
    },
  },
  variants: {
    orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }],
    include: { color: true },
  },
  _count: { select: { reviews: true } },
} as const;

export function generateSlug(name: string): string {
  return slugify(name, { lower: true, strict: true, trim: true });
}

export function resolveCoverImage(product: any): {
  url: string;
  thumbSmUrl: string;
  thumbMdUrl: string;
} | null {
  const variants = product.variants ?? [];
  const colors = product.colors ?? [];
  const defaultVariant =
    variants.find((v: any) => v.isDefault) ?? variants[0];
  const defaultColor = colors.find(
    (c: any) => c.id === defaultVariant?.colorId,
  );
  const colorImage =
    defaultColor?.images?.find((i: any) => i.isPrimary) ??
    defaultColor?.images?.[0];
  if (colorImage) return colorImage;

  const genericImages = product.images ?? [];
  const genericImage =
    genericImages.find((i: any) => i.isPrimary) ?? genericImages[0];
  return genericImage ?? null;
}

export function buildOrderBy(sortBy?: ProductSortBy): any {
  switch (sortBy) {
    case ProductSortBy.PRICE_ASC:
      return { variants: { _min: { price: "asc" } } };
    case ProductSortBy.PRICE_DESC:
      return { variants: { _max: { price: "desc" } } };
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
    const priceFilter: any = {};
    if (query.priceMin !== undefined) priceFilter.gte = query.priceMin;
    if (query.priceMax !== undefined) priceFilter.lte = query.priceMax;
    where.variants = { some: { price: priceFilter } };
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
  return where;
}

export function buildInternalSearchWhereClause(query: {
  search?: string;
}): any {
  const where: any = { status: "ACTIVE" };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      {
        variants: {
          some: { sku: { contains: query.search, mode: "insensitive" } },
        },
      },
    ];
  }
  return where;
}
