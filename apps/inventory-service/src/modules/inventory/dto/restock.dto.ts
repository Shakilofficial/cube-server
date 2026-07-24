import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from "class-validator";

export class RestockDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  variantId: string;

  @IsInt()
  @Min(0)
  quantity: number;

  @IsString()
  @IsOptional()
  sku?: string;
}
