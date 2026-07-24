import { OmitType, PartialType } from "@nestjs/mapped-types";
import { CreateProductColorDto } from "./create-color.dto";

export class UpdateProductColorDto extends PartialType(
  OmitType(CreateProductColorDto, ["id", "tempKey"] as const),
) {}
