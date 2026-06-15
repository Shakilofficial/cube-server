import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Version,
} from '@nestjs/common';
import { SearchService } from './search.service';
import { ResponseMessage } from '@cube/common';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

class SearchQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value?.split(',')))
  brands?: string[];

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value?.split(',')))
  categories?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  rating?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  inStock?: boolean;

  @IsOptional()
  @IsEnum(['relevance', 'price_asc', 'price_desc', 'newest', 'rating'])
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'rating';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /v1/search
   * Full-text product search with facet aggregations.
   * Public — no auth required.
   */
  @Get()
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Search results retrieved successfully')
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }

  /**
   * GET /v1/search/autocomplete?q=...
   * Returns up to 8 product name suggestions for prefix queries.
   */
  @Get('autocomplete')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Autocomplete suggestions retrieved')
  autocomplete(
    @Query('q') q: string = '',
    @Query('limit') limit: number = 8,
  ) {
    return this.searchService.autocomplete(q, Number(limit));
  }
}
