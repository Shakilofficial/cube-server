import { Controller } from "@nestjs/common";
import { EventPattern, Payload } from "@nestjs/microservices";
import { SmsService } from "./sms.service";

@Controller()
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @EventPattern("send_sms")
  async handleSendSms(@Payload() data: { number: string; message: string }) {
    await this.smsService.sendSms(data.number, data.message);
  }
}
