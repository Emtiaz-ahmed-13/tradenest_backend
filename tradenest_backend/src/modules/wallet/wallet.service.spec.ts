import { BadRequestException } from '@nestjs/common';
import { WalletTransactionType } from '../../../generated/prisma/enums';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u1' }),
    },
    wallet: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    walletTransaction: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };

  const service = new WalletService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
  });

  it('returns wallet for current user', async () => {
    prisma.wallet.upsert.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      balance: 0,
      held: 0,
      currency: 'BDT',
      user: { id: 'u1', name: 'Test', email: 'test@test.com' },
    });

    const result = await service.getMe('u1');

    expect(result.data.userId).toBe('u1');
    expect(result.message).toBe('Wallet retrieved');
  });

  it('records hold transactions', async () => {
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) =>
        callback({
          wallet: {
            upsert: jest.fn().mockResolvedValue({
              id: 'w1',
              userId: 'u1',
              balance: 200,
              held: 0,
            }),
            update: jest.fn().mockResolvedValue({
              id: 'w1',
              userId: 'u1',
              balance: 100,
              held: 100,
              user: { id: 'u1', name: 'Test', email: 'test@test.com' },
            }),
          },
          walletTransaction: {
            create: jest.fn().mockResolvedValue({
              id: 't1',
              type: WalletTransactionType.HOLD,
              amount: 100,
              balanceAfter: 100,
            }),
          },
        }),
    );

    const result = await service.hold('u1', {
      amount: 100,
      reference: 'order-1',
    });

    expect(result.message).toBe('Wallet funds held');
  });

  it('rejects hold when balance is insufficient', async () => {
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) =>
        callback({
          wallet: {
            upsert: jest.fn().mockResolvedValue({
              id: 'w1',
              userId: 'u1',
              balance: 50,
              held: 0,
            }),
          },
        }),
    );

    await expect(
      service.hold('u1', { amount: 100, reference: 'order-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
