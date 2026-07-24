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
        fields: [
          "name^3",
          "brandName^2",
          "description",
          "variantSkus^2",
          "variantAttributes",
          "colorNames",
        ],
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
  // A product matches a price window if its variant price *range* overlaps
  // the requested [priceMin, priceMax] window (there is no single flat price
  // anymore — pricing is variant-wise, so minPrice/maxPrice bound the range).
  if (priceMin !== undefined) {
    filter.push({ range: { maxPrice: { gte: priceMin } } });
  }
  if (priceMax !== undefined) {
    filter.push({ range: { minPrice: { lte: priceMax } } });
  }
  if (rating !== undefined) {
    filter.push({ range: { avgRating: { gte: rating } } });
  }

  const sortMap: Record<SearchSortBy, any> = {
    [SearchSortBy.RELEVANCE]: ["_score"],
    [SearchSortBy.PRICE_ASC]: [{ minPrice: "asc" }],
    [SearchSortBy.PRICE_DESC]: [{ maxPrice: "desc" }],
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
      price_stats: { stats: { field: "minPrice" } },
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
