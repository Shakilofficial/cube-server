import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Version,
} from "@nestjs/common";
import { SearchService } from "./search.service";
import { ResponseMessage } from "@cube/common";
import { SearchQueryDto } from "./dto/search-query.dto";

@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /v1/search
   * Full-text product search with facet aggregations.
   * Public — no auth required.
   */
  @Get()
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Search results retrieved successfully")
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }

  /**
   * GET /v1/search/autocomplete?q=...
   * Returns up to 8 product name suggestions for prefix queries.
   */
  @Get("autocomplete")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Autocomplete suggestions retrieved")
  autocomplete(@Query("q") q: string = "", @Query("limit") limit: number = 8) {
    return this.searchService.autocomplete(q, Number(limit));
  }
}
