import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsEnum,
} from "class-validator";
import { UserRole } from "@cube/common";

export class CreateUserDto {
  @IsOptional()
  @IsEmail({}, { message: "A valid email is required." })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: "A valid phone number is required." })
  phone?: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters." })
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      "Password must contain uppercase, lowercase, number and special character.",
  })
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEnum(UserRole, { message: "A valid role is required." })
  role!: UserRole;
}
