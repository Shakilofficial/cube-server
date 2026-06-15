import { IsNotEmpty, IsString } from 'class-validator';

export class SendSmsOtpDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
