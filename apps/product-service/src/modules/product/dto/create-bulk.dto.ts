import { IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { CreateProductDto } from "./create-product.dto";

export class CreateBulkProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductDto)
  products: CreateProductDto[];
}
