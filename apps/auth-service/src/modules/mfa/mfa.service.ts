import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { LoginService } from '../login/login.service';
import { createHash, createDecipheriv } from 'crypto';
import { verifySync } from 'otplib';

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly loginService: LoginService,
  ) {}

  async verifyMfa(tempToken: string, code: string) {
    // Verify temp token
    let payload: { sub: string; type: string };
    try {
      payload = this.jwt.verify(tempToken, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA session token.');
    }

    if (payload.type !== 'mfa_challenge') {
      throw new UnauthorizedException('Invalid token type.');
    }

    const userId = payload.sub;

    // Check backup codes first (6-char alphanumeric)
    if (code.length === 8) {
      return this.verifyBackupCode(userId, code);
    }

    const mfaConfig = await this.prisma.mfaConfig.findUnique({
      where: { userId },
    });

    if (!mfaConfig) {
      throw new BadRequestException('MFA not configured for this user.');
    }

    // Validate the code against the decrypted TOTP secret using otplib verifySync
    const isValidTotp = this.validateTotpCode(
      mfaConfig.totpSecret ?? '',
      code,
    );

    if (!isValidTotp) {
      throw new UnauthorizedException('Invalid MFA code.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    return this.loginService.issueTokenPair(user.id, user.email || '', user.status, user.role);
  }

  private async verifyBackupCode(userId: string, code: string) {
    const mfaConfig = await this.prisma.mfaConfig.findUnique({
      where: { userId },
      include: { backupCodes: { where: { usedAt: null } } },
    });

    if (!mfaConfig) throw new BadRequestException('MFA not configured.');

    const codeHash = createHash('sha256').update(code).digest('hex');
    const matchingCode = mfaConfig.backupCodes.find(
      (bc: { codeHash: string; id: string }) => bc.codeHash === codeHash,
    );

    if (!matchingCode) {
      throw new UnauthorizedException('Invalid backup code.');
    }

    await this.prisma.backupCode.update({
      where: { id: matchingCode.id },
      data: { usedAt: new Date() },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    return this.loginService.issueTokenPair(user.id, user.email || '', user.status, user.role);
  }

  private decryptSecret(encryptedSecret: string): string {
    const encryptionKey =
      this.config.get<string>('MFA_ENCRYPTION_KEY') ||
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      '';
    if (!encryptionKey || !encryptedSecret) {
      return encryptedSecret;
    }
    try {
      const parts = encryptedSecret.split(':');
      if (parts.length !== 2) {
        return encryptedSecret; // Fall back to plaintext if not formatted as iv:ciphertext
      }
      const [ivHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const encryptedText = Buffer.from(encryptedHex, 'hex');

      let key: Buffer;
      if (encryptionKey.length === 64) {
        key = Buffer.from(encryptionKey, 'hex');
      } else {
        key = createHash('sha256').update(encryptionKey).digest();
      }

      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    } catch (err) {
      console.error('MFA decryption failed, falling back to plaintext:', err);
      return encryptedSecret;
    }
  }

  private validateTotpCode(secret: string, code: string): boolean {
    const decryptedSecret = this.decryptSecret(secret);
    try {
      const result = verifySync({ token: code, secret: decryptedSecret });
      return !!result?.valid;
    } catch (err) {
      console.error('TOTP verification failed:', err);
      return false;
    }
  }
}
