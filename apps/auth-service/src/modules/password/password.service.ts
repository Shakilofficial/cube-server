import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import { addHours, isAfter } from "date-fns";
import { EmailPublisher } from "@cube/messaging";
import {
  hashPassword,
  comparePassword,
  hashSHA256,
} from "../../core/utils/crypto.utils";

@Injectable()
export class PasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailPublisher: EmailPublisher,
  ) {}

  async forgotPassword(
    email: string,
  ): Promise<{ message: string; _devToken?: string }> {
    // Always return the same message to prevent user enumeration
    const SAFE_RESPONSE = {
      message:
        "If an account with that email exists, a password reset link has been sent.",
    };

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === "DELETED") return SAFE_RESPONSE;

    // Invalidate any existing tokens
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashSHA256(rawToken);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: addHours(new Date(), 1),
      },
    });

    const resetUrl = `${this.config.get<string>("FRONTEND_URL") || "http://localhost:3000"}/reset-password?token=${rawToken}`;
    const name = user.email ? user.email.split("@")[0] : "User";
    await this.emailPublisher.sendPasswordResetEmail(
      user.email,
      name,
      resetUrl,
    );

    return {
      ...SAFE_RESPONSE,
      ...(process.env.NODE_ENV !== "production" && { _devToken: rawToken }),
    };
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const tokenHash = hashSHA256(rawToken);

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt) {
      throw new BadRequestException("Invalid or expired password reset token.");
    }

    if (isAfter(new Date(), record.expiresAt)) {
      throw new BadRequestException("Password reset token has expired.");
    }

    const rounds = Number(this.config.get("BCRYPT_ROUNDS")) || 12;
    const newHash = await hashPassword(newPassword, rounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: newHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all refresh tokens on password reset
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return {
      message:
        "Password reset successfully. Please log in with your new password.",
    };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status === "DELETED") {
      throw new NotFoundException("User not found.");
    }

    const rounds = Number(this.config.get("BCRYPT_ROUNDS")) || 12;
    const isOldValid = await comparePassword(
      oldPassword,
      user.passwordHash || "",
    );
    if (!isOldValid) {
      throw new BadRequestException("Invalid old password.");
    }

    const newHash = await hashPassword(newPassword, rounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      }),
      // Revoke all refresh tokens on password change
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: "Password changed successfully." };
  }
}
