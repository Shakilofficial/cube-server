import { IsString, MinLength } from "class-validator";

export class CompleteProfileDto {
  @IsString()
  @MinLength(1, { message: "Temporary token is required." })
  tempToken!: string;

  @IsString()
  @MinLength(1, { message: "Value (email or phone) is required." })
  value!: string;
}
