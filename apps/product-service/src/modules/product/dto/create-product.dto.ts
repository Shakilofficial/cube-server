import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { CreateProductColorDto } from "./create-color.dto";
import { CreateProductVariantDto } from "./create-variant.dto";

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsObject()
  specifications?: Record<string, any>;

  @IsUUID()
  brandId: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsArray()
  @ArrayMinSize(1, { message: "At least one color is required." })
  @ValidateNested({ each: true })
  @Type(() => CreateProductColorDto)
  colors: CreateProductColorDto[];

  @IsArray()
  @ArrayMinSize(1, { message: "At least one variant is required." })
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants: CreateProductVariantDto[];
}
