import { Body, Controller, HttpCode, HttpStatus, Post, Version } from '@nestjs/common';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SendSmsOtpDto } from './dto/send-sms-otp.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerificationService } from './verification.service';
import { ResponseMessage } from '@cube/common';

@Controller('auth')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post('verify-email')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Email verified successfully')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.verificationService.verifyEmail(dto.userId, dto.code);
  }

  @Post('resend-verification')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Verification code resent successfully')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.verificationService.resendVerification(dto.userId);
  }

  @Post('send-sms-otp')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('SMS OTP sent successfully')
  sendSmsOtp(@Body() dto: SendSmsOtpDto) {
    return this.verificationService.sendSmsOtp(dto.phone);
  }
}
