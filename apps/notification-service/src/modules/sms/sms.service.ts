import { Logger } from "@cube/logger";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BULK_SMS_RESPONSES } from "./utils/sms.utils";

interface BulkSmsResponse {
  response_code: string | number;
  success_id?: string | number;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger();

  constructor(private readonly config: ConfigService) {}

  async sendSms(phone: string, message: string): Promise<void> {
    try {
      const apiKey =
        this.config.get<string>("SMS_API_KEY") || "2Z5ENsglfgnBuj0nKyXI";
      const senderId =
        this.config.get<string>("SMS_SENDER_ID") || "8809648909034";

      const url = new URL("http://bulksmsbd.net/api/smsapi");
      url.searchParams.append("api_key", apiKey);
      url.searchParams.append("type", "text");
      url.searchParams.append("number", phone);
      url.searchParams.append("senderid", senderId);
      url.searchParams.append("message", message);

      this.logger.log(`Dispatching SMS to ${phone} using BulkSMSBD...`);

      const response = await fetch(url.toString(), { method: "POST" });

      if (!response.ok) {
        throw new Error(`BulkSMSBD API returned status ${response.status}`);
      }

      const body = (await response.json()) as BulkSmsResponse;
      const apiCode = Number(body?.response_code);
      const messageStatus =
        BULK_SMS_RESPONSES[apiCode] || `Unknown Response Code (${apiCode})`;

      if (apiCode === 202) {
        this.logger.log(
          `SMS successfully submitted for ${phone}. Status: ${messageStatus} (SuccessID: ${body.success_id ?? "N/A"})`,
        );
      } else {
        this.logger.error(
          `Failed to submit SMS for ${phone}. Error Code ${apiCode}: ${messageStatus}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Unhandled error while sending SMS to ${phone}: ${error?.message || error}`,
        error?.stack,
      );
    }
  }
}
