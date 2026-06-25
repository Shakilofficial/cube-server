import { IsString, IsNotEmpty } from "class-validator";

export class ConfirmReleaseDto {
  @IsString()
  @IsNotEmpty()
  referenceId: string;

  @IsString()
  @IsNotEmpty()
  referenceType: string;
}
