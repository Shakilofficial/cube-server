import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  Version,
} from "@nestjs/common";
import { MfaService } from "./mfa.service";
import { VerifyMfaDto } from "./dto/verify-mfa.dto";
import { Response } from "express";
import { ResponseMessage } from "@cube/common";

@Controller("auth/mfa")
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post("verify")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("MFA verification successful")
  async verify(
    @Body() dto: VerifyMfaDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.mfaService.verifyMfa(dto.tempToken, dto.code);

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return result;
  }
}
