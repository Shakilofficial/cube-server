import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SearchParams } from "../dto/search-query.dto";

@Injectable()
export class SearchFallbackHelper {
  private readonly logger = new Logger(SearchFallbackHelper.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * PostgreSQL fallback search querying the product-service internal search endpoint.
   */
  async postgresqlFallback(params: SearchParams) {
    const { query, page = 1, limit = 20 } = params;
    const productServiceUrl =
      this.config.get<string>("PRODUCT_SERVICE_URL") || "http://localhost:3004";

    const url = new URL(`${productServiceUrl}/v1/products/internal/search`);
    if (query) url.searchParams.set("search", query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(limit));

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
      this.logger.error(`PostgreSQL fallback search failed: ${err.message}`);
      return {
        data: [],
        facets: null,
        fallback: true,
        meta: { page, limit, total: 0 },
      };
    }
  }
}
