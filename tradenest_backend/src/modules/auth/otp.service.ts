import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../common/services/email.service';
import { SmsService } from '../../common/services/sms.service';

type OtpRecord = {
  code: string;
  expiresAt: number;
};

@Injectable()
export class OtpService {
  private readonly store = new Map<string, OtpRecord>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
  ) {}

  async sendPhoneOtp(phone: string) {
    const normalized = this.normalizePhone(phone);
    const code = this.generateCode();
    const ttl = this.configService.get<number>('otp.ttlSeconds') ?? 300;

    this.store.set(`phone:${normalized}`, {
      code,
      expiresAt: Date.now() + ttl * 1000,
    });

    await this.smsService.sendOtp(normalized, code);

    return {
      message: 'OTP sent',
      data: { phone: normalized, expiresIn: ttl },
    };
  }

  async verifyPhoneOtp(phone: string, code: string) {
    const normalized = this.normalizePhone(phone);
    const record = this.store.get(`phone:${normalized}`);

    if (!record || record.expiresAt < Date.now()) {
      throw new UnauthorizedException('OTP expired or not found');
    }

    if (record.code !== code) {
      throw new UnauthorizedException('Invalid OTP');
    }

    this.store.delete(`phone:${normalized}`);

    const user = await this.prisma.user.findUnique({
      where: { phone: normalized },
    });

    return {
      message: 'OTP verified',
      data: { phone: normalized, userExists: Boolean(user), userId: user?.id },
    };
  }

  async sendEmailOtp(email: string) {
    const normalized = email.trim().toLowerCase();
    const code = this.generateCode();
    const ttl = this.configService.get<number>('otp.ttlSeconds') ?? 300;

    this.store.set(`email:${normalized}`, {
      code,
      expiresAt: Date.now() + ttl * 1000,
    });

    await this.emailService.send({
      to: normalized,
      subject: 'TradeNest verification code',
      html: `<p>Your TradeNest verification code is <strong>${code}</strong>. It expires in ${ttl} seconds.</p>`,
    });

    return {
      message: 'Email OTP sent',
      data: { email: normalized, expiresIn: ttl },
    };
  }

  async verifyEmailOtp(email: string, code: string) {
    const normalized = email.trim().toLowerCase();
    const record = this.store.get(`email:${normalized}`);

    if (!record || record.expiresAt < Date.now()) {
      throw new UnauthorizedException('OTP expired or not found');
    }

    if (record.code !== code) {
      throw new UnauthorizedException('Invalid OTP');
    }

    this.store.delete(`email:${normalized}`);

    await this.prisma.user.updateMany({
      where: { email: normalized },
      data: { emailVerified: true },
    });

    return {
      message: 'Email verified',
      data: { email: normalized },
    };
  }

  private generateCode(): string {
    const length = this.configService.get<number>('otp.length') ?? 6;
    const max = 10 ** length;
    return String(randomInt(0, max)).padStart(length, '0');
  }

  private normalizePhone(phone: string): string {
    const normalized = phone.replace(/\s+/g, '').trim();

    if (!/^\+?8801\d{9}$/.test(normalized) && !/^01\d{9}$/.test(normalized)) {
      throw new BadRequestException('Invalid Bangladesh phone number');
    }

    return normalized.startsWith('+')
      ? normalized
      : `+880${normalized.slice(1)}`;
  }
}
