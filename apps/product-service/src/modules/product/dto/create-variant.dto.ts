import { Type } from "class-transformer";
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from "class-validator";

export class CreateProductVariantDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @Type(() => Number)
  @IsPositive()
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  compareAtPrice?: number;

  @IsObject()
  attributes: Record<string, any>;

  // Exactly one of colorId (existing color) / colorTempKey (color created in
  // the same request) must be supplied — validated in the service.
  @IsOptional()
  @IsUUID()
  colorId?: string;

  @IsOptional()
  @IsString()
  colorTempKey?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
