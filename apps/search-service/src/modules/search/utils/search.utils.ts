import { SearchParams } from "../dto/search-query.dto";
import { SearchSortBy } from "../enums/search.enums";

/**
 * Builds the Elasticsearch search request body from input query parameters.
 */
export function buildElasticsearchQuery(
  params: SearchParams,
  indexName: string,
) {
  const {
    query,
    brands,
    categories,
    priceMin,
    priceMax,
    rating,
    inStock,
    sortBy = SearchSortBy.RELEVANCE,
    page = 1,
    limit = 20,
  } = params;

  const must: any[] = [{ term: { status: "ACTIVE" } }];
  const filter: any[] = [];

  if (query) {
    must.push({
      multi_match: {
        query,
        fields: ["name^3", "brandName^2", "description", "sku"],
        fuzziness: "AUTO",
        type: "best_fields",
      },
    });
  }

  if (brands?.length) {
    filter.push({ terms: { "brandName.keyword": brands } });
  }
  if (categories?.length) {
    filter.push({ terms: { "categoryNames.keyword": categories } });
  }
  if (inStock !== undefined) {
    filter.push({ term: { inStock } });
  }
  if (priceMin !== undefined || priceMax !== undefined) {
    filter.push({
      range: {
        price: {
          ...(priceMin !== undefined && { gte: priceMin }),
          ...(priceMax !== undefined && { lte: priceMax }),
        },
      },
    });
  }
  if (rating !== undefined) {
    filter.push({ range: { avgRating: { gte: rating } } });
  }

  const sortMap: Record<SearchSortBy, any> = {
    [SearchSortBy.RELEVANCE]: ["_score"],
    [SearchSortBy.PRICE_ASC]: [{ price: "asc" }],
    [SearchSortBy.PRICE_DESC]: [{ price: "desc" }],
    [SearchSortBy.NEWEST]: [{ createdAt: "desc" }],
    [SearchSortBy.RATING]: [{ avgRating: "desc" }],
  };

  return {
    index: indexName,
    from: (page - 1) * limit,
    size: limit,
    query: { bool: { must, filter } },
    sort: sortMap[sortBy] ?? ["_score"],
    aggs: {
      brands: { terms: { field: "brandName.keyword", size: 20 } },
      categories: { terms: { field: "categoryNames.keyword", size: 20 } },
      price_stats: { stats: { field: "price" } },
      ratings: { terms: { field: "avgRating", size: 5 } },
    },
  };
}

/**
 * Formats the Elasticsearch query response hits and facet aggregations.
 */
export function formatSearchResult(result: any, page: number, limit: number) {
  const totalValue = result.hits.total;
  const total =
    typeof totalValue === "number" ? totalValue : (totalValue?.value ?? 0);

  const data = result.hits.hits.map((h: any) => h._source);

  const facets = {
    brands: result.aggregations?.brands?.buckets ?? [],
    categories: result.aggregations?.categories?.buckets ?? [],
    priceStats: result.aggregations?.price_stats ?? {},
    ratings: result.aggregations?.ratings?.buckets ?? [],
  };

  return {
    meta: { page, limit, total },
    data,
    facets,
  };
}
