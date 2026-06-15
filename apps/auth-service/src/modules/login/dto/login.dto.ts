import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1, { message: 'Email or phone number is required.' })
  emailOrPhone!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
