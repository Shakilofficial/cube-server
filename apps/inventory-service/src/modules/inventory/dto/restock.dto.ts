import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from "class-validator";

export class RestockDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(0)
  quantity: number;

  @IsString()
  @IsOptional()
  sku?: string;
}
