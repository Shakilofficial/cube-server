import { Inject, Injectable } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";

@Injectable()
export class EmailPublisher {
  constructor(@Inject("SMS_SERVICE") private readonly client: ClientProxy) {}

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    html?: string,
    template?: string,
    context?: Record<string, any>,
  ): Promise<void> {
    this.client.emit("send_email", {
      to,
      subject,
      body,
      html,
      template,
      context,
    });
  }

  async sendOtpEmail(
    to: string,
    name: string,
    otpCode: string,
    verifyUrl: string,
  ): Promise<void> {
    await this.sendEmail(
      to,
      "Verify Your Email",
      `Your verification code is ${otpCode}.`,
      undefined,
      "verify-email",
      { name, otp: otpCode, verifyUrl },
    );
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    await this.sendEmail(
      to,
      "Congratulations and Welcome!",
      "Welcome to Cube! Your account has been successfully created.",
      undefined,
      "welcome",
      { name },
    );
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    resetUrl: string,
  ): Promise<void> {
    await this.sendEmail(
      to,
      "Reset Your Password",
      `Use this link to reset your password: ${resetUrl}`,
      undefined,
      "password-reset",
      { name, resetUrl },
    );
  }
}
