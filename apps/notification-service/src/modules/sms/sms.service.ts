import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@cube/logger';

const BULK_SMS_RESPONSES: Record<number, string> = {
  202: 'SMS Submitted Successfully',
  1001: 'Invalid Number',
  1002: 'Sender ID not correct / Sender ID is disabled',
  1003: 'Please Required all fields / Contact Your System Administrator',
  1005: 'Internal Error',
  1006: 'Balance Validity Not Available',
  1007: 'Balance Insufficient',
  1011: 'User ID not found',
  1012: 'Masking SMS must be sent in Bengali',
  1013: 'Sender ID has not found Gateway by API Key',
  1014: 'Sender Type Name not found using this sender by API Key',
  1015: 'Sender ID has not found Any Valid Gateway by API Key',
  1016: 'Sender Type Name Active Price Info not found by this sender ID',
  1017: 'Sender Type Name Price Info not found by this sender ID',
  1018: 'The Owner of this (username) Account is disabled',
  1019: 'The (sender type name) Price of this (username) Account is disabled',
  1020: 'The parent of this account is not found.',
  1021: 'The parent active (sender type name) price of this account is not found.',
  1031: 'Your Account Not Verified, Please Contact Administrator.',
  1032: 'IP Not whitelisted',
};

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
        this.config.get<string>('SMS_API_KEY') || '2Z5ENsglfgnBuj0nKyXI';
      const senderId =
        this.config.get<string>('SMS_SENDER_ID') || '8809648909034';

      const url = new URL('http://bulksmsbd.net/api/smsapi');
      url.searchParams.append('api_key', apiKey);
      url.searchParams.append('type', 'text');
      url.searchParams.append('number', phone);
      url.searchParams.append('senderid', senderId);
      url.searchParams.append('message', message);

      this.logger.log(`Dispatching SMS to ${phone} using BulkSMSBD...`);

      const response = await fetch(url.toString(), { method: 'POST' });

      if (!response.ok) {
        throw new Error(`BulkSMSBD API returned status ${response.status}`);
      }

      const body = (await response.json()) as BulkSmsResponse;
      const apiCode = Number(body?.response_code);
      const messageStatus =
        BULK_SMS_RESPONSES[apiCode] || `Unknown Response Code (${apiCode})`;

      if (apiCode === 202) {
        this.logger.log(
          `SMS successfully submitted for ${phone}. Status: ${messageStatus} (SuccessID: ${body.success_id ?? 'N/A'})`,
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
