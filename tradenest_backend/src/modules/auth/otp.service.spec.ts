import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'otp.ttlSeconds') return 300;
      if (key === 'otp.length') return 6;
      return undefined;
    }),
  } as unknown as ConfigService;

  const prisma = {
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const emailService = { send: jest.fn() };
  const smsService = { sendOtp: jest.fn() };

  const service = new OtpService(
    configService,
    prisma as never,
    emailService as never,
    smsService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes Bangladesh phone numbers', async () => {
    await service.sendPhoneOtp('01712345678');

    expect(smsService.sendOtp).toHaveBeenCalledWith(
      '+8801712345678',
      expect.any(String),
    );
  });

  it('rejects invalid phone numbers', async () => {
    await expect(service.sendPhoneOtp('123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
