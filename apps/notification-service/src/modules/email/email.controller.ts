import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailService } from './email.service';

interface EmailPayload {
  to: string;
  subject: string;
  body?: string;
  html?: string;
  template?: string;
  context?: Record<string, any>;
}

@Controller()
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @EventPattern('send_email')
  async handleSendEmail(@Payload() data: EmailPayload) {
    await this.emailService.sendEmail(data);
  }
}
