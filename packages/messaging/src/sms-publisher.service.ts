import { Inject, Injectable } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";

@Injectable()
export class SmsPublisher {
  constructor(@Inject("SMS_SERVICE") private readonly client: ClientProxy) {}

  async sendSms(phone: string, message: string): Promise<void> {
    this.client.emit("send_sms", { number: phone, message });
  }

  async sendOtp(
    phone: string,
    brandName: string,
    otpCode: string,
  ): Promise<void> {
    const message = `Your ${brandName} OTP is ${otpCode}`;
    await this.sendSms(phone, message);
  }
}
