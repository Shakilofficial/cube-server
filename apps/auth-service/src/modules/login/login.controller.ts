import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  Version,
  BadRequestException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoginService } from './login.service';
import { LoginDto } from './dto/login.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';
import { TokenService } from '../session/token.service';
import { PushPublisher } from '@cube/messaging';
import { ResponseMessage, JwtAuthGuard } from '@cube/common';

@Controller('auth')
export class LoginController {
  constructor(
    private readonly loginService: LoginService,
    private readonly tokenService: TokenService,
    private readonly pushPublisher: PushPublisher,
  ) {}

  @Post('test-push')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Push event published to queue successfully')
  async testPush(@Body() dto: { userId: string; title: string; message: string; data?: any }) {
    if (!dto.userId || !dto.title || !dto.message) {
      throw new BadRequestException('userId, title, and message are required.');
    }
    await this.pushPublisher.sendPush(dto.userId, dto.title, dto.message, dto.data);
    return { success: true, message: 'Push event published to queue.' };
  }

  @Post('login')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Login challenge initiated successfully')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return this.loginService.login(dto.emailOrPhone, dto.password, ip, userAgent);
  }

  @Post('complete-profile')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Profile completed successfully')
  completeProfile(@Body() dto: CompleteProfileDto) {
    try {
      const decoded = this.tokenService.verifyTempChallengeToken(dto.tempToken);
      if (decoded.type !== 'profile_completion') {
        throw new BadRequestException('Invalid challenge token.');
      }
      return this.loginService.completeProfile(decoded.sub, dto.value);
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Invalid or expired challenge token.');
    }
  }

  @Post('verify-login-otp')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('OTP verified and login successful')
  async verifyLoginOtp(
    @Body() dto: VerifyLoginOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const decoded = this.tokenService.verifyTempChallengeToken(dto.tempToken);
      if (decoded.type !== 'login_otp') {
        throw new BadRequestException('Invalid challenge token.');
      }
      const result = await this.loginService.verifyLoginOtp(decoded.sub, dto.code);

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return result;
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Invalid or expired challenge token.');
    }
  }

  @Get('login/history')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Login history retrieved successfully')
  async getLoginHistory(@Req() req: any, @Query('limit') limit?: number) {
    const userId = req.user.sub;
    const limitNum = limit ? Number(limit) : 20;
    return this.loginService.getLoginHistory(userId, limitNum);
  }
}
