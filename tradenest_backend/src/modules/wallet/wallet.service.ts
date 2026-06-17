import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  UserRole,
  WalletTransactionType,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditWalletDto } from './dto/credit-wallet.dto';
import { DebitWalletDto } from './dto/debit-wallet.dto';

@Injectable()
export class WalletService {
  private readonly walletInclude: Prisma.WalletInclude = {
    user: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);

    return {
      message: 'Wallet retrieved',
      data: wallet,
    };
  }

  async listTransactions(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    const transactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      message: 'Wallet transactions retrieved',
      data: transactions,
    };
  }

  async hold(userId: string, dto: DebitWalletDto) {
    const data = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.getOrCreateWalletForTx(tx, userId);
      const balance = Number(wallet.balance);
      const held = Number(wallet.held);

      if (balance < dto.amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const nextBalance = balance - dto.amount;
      const nextHeld = held + dto.amount;
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: nextBalance,
          held: nextHeld,
        },
        include: this.walletInclude,
      });
      const transaction = await this.createTransaction(tx, {
        walletId: wallet.id,
        type: WalletTransactionType.HOLD,
        amount: dto.amount,
        balanceAfter: nextBalance,
        reference: dto.reference,
        description: dto.description,
        metadata: dto.metadata,
      });

      return { wallet: updatedWallet, transaction };
    });

    return {
      message: 'Wallet funds held',
      data,
    };
  }

  async release(userId: string, dto: CreditWalletDto) {
    const data = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.getOrCreateWalletForTx(tx, userId);
      const balance = Number(wallet.balance);
      const held = Number(wallet.held);

      if (held < dto.amount) {
        throw new BadRequestException('Insufficient held wallet balance');
      }

      const nextBalance = balance + dto.amount;
      const nextHeld = held - dto.amount;
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: nextBalance,
          held: nextHeld,
        },
        include: this.walletInclude,
      });
      const transaction = await this.createTransaction(tx, {
        walletId: wallet.id,
        type: WalletTransactionType.RELEASE,
        amount: dto.amount,
        balanceAfter: nextBalance,
        reference: dto.reference,
        description: dto.description,
        metadata: dto.metadata,
      });

      return { wallet: updatedWallet, transaction };
    });

    return {
      message: 'Wallet hold released',
      data,
    };
  }

  async refund(adminId: string, dto: CreditWalletDto) {
    await this.ensureAdmin(adminId);

    if (!dto.userId) {
      throw new BadRequestException('User id is required for refund');
    }

    await this.ensureUserExists(dto.userId);

    const data = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.getOrCreateWalletForTx(tx, dto.userId!);
      const nextBalance = Number(wallet.balance) + dto.amount;
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: nextBalance },
        include: this.walletInclude,
      });
      const transaction = await this.createTransaction(tx, {
        walletId: wallet.id,
        type: WalletTransactionType.REFUND,
        amount: dto.amount,
        balanceAfter: nextBalance,
        reference: dto.reference,
        description: dto.description,
        metadata: {
          ...(dto.metadata ?? {}),
          refundedBy: adminId,
        },
      });

      return { wallet: updatedWallet, transaction };
    });

    return {
      message: 'Wallet refunded',
      data,
    };
  }

  private async getOrCreateWallet(userId: string) {
    await this.ensureUserExists(userId);

    return this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        currency: 'BDT',
      },
      include: this.walletInclude,
    });
  }

  private async getOrCreateWalletForTx(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    return tx.wallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        currency: 'BDT',
      },
    });
  }

  private async createTransaction(
    tx: Prisma.TransactionClient,
    data: {
      walletId: string;
      type: WalletTransactionType;
      amount: number;
      balanceAfter: number;
      reference?: string;
      description?: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    return tx.walletTransaction.create({ data });
  }

  private async ensureAdmin(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });

    if (!user || user.role !== UserRole.ADMIN || !user.isActive) {
      throw new ForbiddenException('Admin account required');
    }
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }
}
