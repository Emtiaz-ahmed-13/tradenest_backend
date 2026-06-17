import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('resend.apiKey');
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async send(input: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const from = this.configService.get<string>('resend.fromEmail');

    if (!this.resend || !from) {
      this.logger.warn(
        `Email skipped (not configured): ${input.subject} -> ${input.to}`,
      );
      return;
    }

    await this.resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
  }
}
