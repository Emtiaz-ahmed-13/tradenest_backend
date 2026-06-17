import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    const provider =
      this.configService.get<string>('sms.provider') ?? 'console';
    const apiKey = this.configService.get<string>('sms.apiKey');
    const senderId =
      this.configService.get<string>('sms.senderId') ?? 'TradeNest';
    const message = `Your TradeNest verification code is ${code}. Valid for 5 minutes.`;

    if (provider === 'console' || !apiKey) {
      this.logger.log(`OTP for ${phone}: ${code}`);
      return;
    }

    if (provider === 'bulksmsbd') {
      await this.sendBulkSmsBd(phone, message, apiKey, senderId);
      return;
    }

    if (provider === 'http') {
      await this.sendHttpSms(phone, message, apiKey, senderId);
      return;
    }

    this.logger.warn(`Unknown SMS provider "${provider}"; OTP logged instead.`);
    this.logger.log(`OTP for ${phone}: ${code}`);
  }

  private async sendBulkSmsBd(
    phone: string,
    message: string,
    apiKey: string,
    senderId: string,
  ): Promise<void> {
    const baseUrl =
      this.configService.get<string>('sms.baseUrl') ??
      'https://bulksmsbd.net/api/smsapi';
    const url = new URL(baseUrl);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('type', 'text');
    url.searchParams.set('number', phone.replace(/^\+/, ''));
    url.searchParams.set('senderid', senderId);
    url.searchParams.set('message', message);

    const response = await fetch(url.toString(), { method: 'GET' });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`BulkSMSBD failed (${response.status}): ${body}`);
    }

    this.logger.log(`SMS OTP sent via BulkSMSBD to ${phone}`);
  }

  private async sendHttpSms(
    phone: string,
    message: string,
    apiKey: string,
    senderId: string,
  ): Promise<void> {
    const baseUrl = this.configService.get<string>('sms.baseUrl');

    if (!baseUrl) {
      throw new Error('SMS_BASE_URL is required when SMS_PROVIDER=http');
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: phone,
        message,
        senderId,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP SMS failed (${response.status}): ${body}`);
    }

    this.logger.log(`SMS OTP sent via HTTP provider to ${phone}`);
  }
}
