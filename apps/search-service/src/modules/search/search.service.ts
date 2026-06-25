import { Injectable, Logger } from "@nestjs/common";
import { ProductIndexService } from "../indexing/product.index";
import { SearchParams } from "./dto/search-query.dto";
import { SearchFallbackHelper } from "./helpers/fallback.helper";
import {
  buildElasticsearchQuery,
  formatSearchResult,
} from "./utils/search.utils";

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly indexService: ProductIndexService,
    private readonly fallbackHelper: SearchFallbackHelper,
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
      return this.fallbackHelper.postgresqlFallback(params);
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
              { term: { status: "ACTIVE" } },
              {
                match_phrase_prefix: {
                  name: { query: q, max_expansions: 20 },
                },
              },
            ],
          },
        },
        _source: ["name"],
      });

      return result.hits.hits.map((h: any) => h._source?.name).filter(Boolean);
    } catch (err: any) {
      this.logger.warn(`Autocomplete failed: ${err.message}`);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Elasticsearch full-text search with facets
  // ─────────────────────────────────────────────────────────────────────────

  private async elasticsearchSearch(params: SearchParams) {
    const es = this.indexService.getClient();
    const queryBody = buildElasticsearchQuery(params, this.indexService.INDEX);
    const result = await es.search(queryBody);
    return formatSearchResult(result, params.page ?? 1, params.limit ?? 20);
  }
}
