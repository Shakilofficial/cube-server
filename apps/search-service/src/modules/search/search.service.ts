import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductIndexService } from '../indexing/product.index';

export interface SearchParams {
  query?: string;
  brands?: string[];
  categories?: string[];
  priceMin?: number;
  priceMax?: number;
  rating?: number;
  inStock?: boolean;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'rating';
  page?: number;
  limit?: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly indexService: ProductIndexService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Public search — tries Elasticsearch, falls back to product-service HTTP
  // ─────────────────────────────────────────────────────────────────────────

  async search(params: SearchParams) {
    try {
      return await this.elasticsearchSearch(params);
    } catch (err: any) {
      this.logger.warn(
        `Elasticsearch unavailable, falling back to PostgreSQL: ${err.message}`,
      );
      return this.postgresqlFallback(params);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Autocomplete — prefix suggestion on name field
  // ─────────────────────────────────────────────────────────────────────────

  async autocomplete(q: string, limit = 8): Promise<string[]> {
    try {
      const es = this.indexService.getClient();
      const result = await es.search({
        index: this.indexService.INDEX,
        size: limit,
        query: {
          bool: {
            must: [
              { term: { status: 'ACTIVE' } },
              {
                match_phrase_prefix: {
                  name: { query: q, max_expansions: 20 },
                },
              },
            ],
          },
        },
        _source: ['name'],
      });

      return result.hits.hits.map((h: any) => h._source?.name).filter(Boolean);
    } catch (err: any) {
      this.logger.warn(`Autocomplete failed: ${err.message}`);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Elasticsearch full-text search with facets (spec 2.3)
  // ─────────────────────────────────────────────────────────────────────────

  private async elasticsearchSearch(params: SearchParams) {
    const {
      query,
      brands,
      categories,
      priceMin,
      priceMax,
      rating,
      inStock,
      sortBy = 'relevance',
      page = 1,
      limit = 20,
    } = params;

    const es = this.indexService.getClient();

    const must: any[] = [{ term: { status: 'ACTIVE' } }];
    const filter: any[] = [];

    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ['name^3', 'brandName^2', 'description', 'sku'],
          fuzziness: 'AUTO',
          type: 'best_fields',
        },
      });
    }

    if (brands?.length) {
      filter.push({ terms: { 'brandName.keyword': brands } });
    }
    if (categories?.length) {
      filter.push({ terms: { 'categoryNames.keyword': categories } });
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

    const sortMap: Record<string, any> = {
      relevance:  ['_score'],
      price_asc:  [{ price: 'asc' }],
      price_desc: [{ price: 'desc' }],
      newest:     [{ createdAt: 'desc' }],
      rating:     [{ avgRating: 'desc' }],
    };

    const result = await es.search({
      index: this.indexService.INDEX,
      from: (page - 1) * limit,
      size: limit,
      query: { bool: { must, filter } },
      sort: sortMap[sortBy] ?? ['_score'],
      aggs: {
        brands:      { terms: { field: 'brandName.keyword', size: 20 } },
        categories:  { terms: { field: 'categoryNames.keyword', size: 20 } },
        price_stats: { stats: { field: 'price' } },
        ratings:     { terms: { field: 'avgRating', size: 5 } },
      },
    });

    return this.formatSearchResult(result, page, limit);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PostgreSQL fallback via product-service internal HTTP endpoint
  // ─────────────────────────────────────────────────────────────────────────

  private async postgresqlFallback(params: SearchParams) {
    const { query, page = 1, limit = 20 } = params;
    const productServiceUrl =
      this.config.get<string>('PRODUCT_SERVICE_URL') || 'http://localhost:3004';

    const url = new URL(`${productServiceUrl}/v1/products/internal/search`);
    if (query) url.searchParams.set('search', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));

    try {
      const res = await fetch(url.toString());
      const json = (await res.json()) as any;
      return {
        data: json.products ?? [],
        facets: null,
        fallback: true,
        meta: { page, limit, total: json.products?.length ?? 0 },
      };
    } catch (err: any) {
      this.logger.error(`PostgreSQL fallback also failed: ${err.message}`);
      return { data: [], facets: null, fallback: true, meta: { page, limit, total: 0 } };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Result formatter
  // ─────────────────────────────────────────────────────────────────────────

  private formatSearchResult(result: any, page: number, limit: number) {
    const totalValue = result.hits.total;
    const total =
      typeof totalValue === 'number' ? totalValue : totalValue?.value ?? 0;

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
}
