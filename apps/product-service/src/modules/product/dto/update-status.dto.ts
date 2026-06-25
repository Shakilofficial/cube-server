import { IsEnum } from "class-validator";
import { ProductStatus } from "../../../../prisma/generated/prisma/enums";

export class UpdateStatusDto {
  @IsEnum(ProductStatus)
  status: ProductStatus;
}
