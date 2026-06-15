import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@cube/logger';
import * as nodemailer from 'nodemailer';
import * as ejs from 'ejs';
import { join } from 'path';

interface BulkEmailPayload {
  to: string;
  subject: string;
  body?: string;
  html?: string;
  template?: string;
  context?: Record<string, any>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger();
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = Number(this.config.get('SMTP_PORT')) || 465;
    const user =
      this.config.get<string>('SENDER_EMAIL') || 'waltonsmart72@gmail.com';
    const pass =
      this.config.get<string>('SENDER_APP_PASSWORD') || 'shqg jino xwig okev';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  async sendEmail(payload: BulkEmailPayload): Promise<void> {
    const { to, subject, body = '', html, template, context } = payload;
    try {
      this.logger.log(
        `Preparing to send email to ${to} with subject: "${subject}"...`,
      );

      let htmlContent = html || body;

      if (template) {
        // Templates live alongside this service file in the templates/ sub-folder.
        // __dirname resolves to the compiled output directory, preserving the relative structure.
        const templatePath = join(__dirname, 'templates', `${template}.ejs`);
        this.logger.log(`Compiling EJS template from: ${templatePath}`);

        const templateContext = {
          companyName: this.config.get<string>('COMPANY_NAME') || 'Cube',
          frontendUrl:
            this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000',
          supportEmail:
            this.config.get<string>('SUPPORT_EMAIL') || 'support@cube.com',
          ...context,
        };

        htmlContent = await ejs.renderFile(templatePath, templateContext);
      }

      const senderEmail =
        this.config.get<string>('SENDER_EMAIL') || 'waltonsmart72@gmail.com';
      const senderName =
        this.config.get<string>('SENDER_NAME') || 'Cube System';

      const info = await this.transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to,
        subject,
        text: body,
        html: htmlContent,
      });

      this.logger.log(
        `Email successfully dispatched to ${to}. MessageID: ${info.messageId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error sending email to ${to}: ${error?.message || error}`,
        error?.stack,
      );
    }
  }
}
