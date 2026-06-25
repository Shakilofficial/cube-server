import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Type, Transform } from "class-transformer";
import { SearchSortBy } from "../enums/search.enums";

export interface SearchParams {
  query?: string;
  brands?: string[];
  categories?: string[];
  priceMin?: number;
  priceMax?: number;
  rating?: number;
  inStock?: boolean;
  sortBy?: SearchSortBy;
  page?: number;
  limit?: number;
}

export class SearchQueryDto implements SearchParams {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value?.split(",")))
  brands?: string[];

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value?.split(",")))
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
  @Transform(({ value }) => value === "true")
  inStock?: boolean;

  @IsOptional()
  @IsEnum(SearchSortBy)
  sortBy?: SearchSortBy;

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
