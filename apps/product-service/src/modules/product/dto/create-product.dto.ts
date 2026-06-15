import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsDecimal,
  IsObject,
  MinLength,
  MaxLength,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  sku: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @Type(() => Number)
  @IsPositive()
  price: number;

  @IsUUID()
  brandId: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
