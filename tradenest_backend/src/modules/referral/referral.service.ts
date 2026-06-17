import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  ReferralStatus,
  WalletTransactionType,
} from '../../../generated/prisma/enums';
import { ensureAdmin } from '../../common/helpers/role-check.helper';
import { PrismaService } from '../../prisma/prisma.service';
import { RewardReferralDto } from './dto/reward-referral.dto';
import { TrackReferralDto } from './dto/track-referral.dto';

@Injectable()
export class ReferralService {
  private readonly defaultRewardAmount = 100;
  private readonly referralInclude: Prisma.ReferralInclude = {
    referrer: {
      select: { id: true, name: true, email: true, referralCode: true },
    },
    referredUser: { select: { id: true, name: true, email: true } },
  };

  constructor(private readonly prisma: PrismaService) {}

  async generateCode(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, referralCode: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.referralCode) {
      return {
        message: 'Referral code retrieved',
        data: { code: user.referralCode },
      };
    }

    const referralCode = await this.createUniqueReferralCode(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { referralCode },
      select: { referralCode: true },
    });

    return {
      message: 'Referral code generated',
      data: { code: updated.referralCode },
    };
  }

  async getMine(userId: string) {
    const [user, referrals] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          referralCode: true,
          referredBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.referral.findMany({
        where: { referrerId: userId },
        include: this.referralInclude,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      message: 'Referrals retrieved',
      data: {
        code: user.referralCode,
        referredBy: user.referredBy,
        referrals,
      },
    };
  }

  async trackReferral(referredUserId: string, dto: TrackReferralDto) {
    const code = this.normalizeCode(dto.code);
    const referrer = await this.prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true, referralCode: true },
    });

    if (!referrer) {
      throw new NotFoundException('Referral code not found');
    }

    if (referrer.id === referredUserId) {
      throw new BadRequestException('Users cannot refer themselves');
    }

    const referredUser = await this.prisma.user.findUnique({
      where: { id: referredUserId },
      select: { id: true, referredById: true },
    });

    if (!referredUser) {
      throw new NotFoundException('Referred user not found');
    }

    if (referredUser.referredById) {
      throw new BadRequestException('Referral has already been tracked');
    }

    const referral = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: referredUserId },
        data: { referredById: referrer.id },
      });

      return tx.referral.upsert({
        where: {
          referrerId_referredUserId: {
            referrerId: referrer.id,
            referredUserId,
          },
        },
        create: {
          referrerId: referrer.id,
          referredUserId,
          code,
        },
        update: { code },
        include: this.referralInclude,
      });
    });

    return {
      message: 'Referral tracked',
      data: referral,
    };
  }

  async rewardReferral(
    adminId: string,
    referralId: string,
    dto: RewardReferralDto,
  ) {
    await ensureAdmin(this.prisma, adminId);

    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: this.referralInclude,
    });

    if (!referral) {
      throw new NotFoundException('Referral not found');
    }

    if (referral.status === ReferralStatus.REWARDED) {
      throw new BadRequestException('Referral already rewarded');
    }

    if (referral.status === ReferralStatus.EXPIRED) {
      throw new BadRequestException('Expired referrals cannot be rewarded');
    }

    const rewardAmount = dto.amount ?? this.defaultRewardAmount;
    const updated = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId: referral.referrerId },
        create: {
          userId: referral.referrerId,
          balance: rewardAmount,
          currency: 'BDT',
        },
        update: { balance: { increment: rewardAmount } },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.CREDIT,
          amount: rewardAmount,
          balanceAfter: wallet.balance,
          reference: referral.id,
          description: 'Referral reward',
          metadata: {
            referralId: referral.id,
            referredUserId: referral.referredUserId,
          },
        },
      });

      return tx.referral.update({
        where: { id: referral.id },
        data: {
          status: ReferralStatus.REWARDED,
          rewardAmount,
          rewardedAt: new Date(),
        },
        include: this.referralInclude,
      });
    });

    return {
      message: 'Referral rewarded',
      data: updated,
    };
  }

  private async createUniqueReferralCode(userId: string): Promise<string> {
    const prefix = userId.slice(0, 6).toUpperCase();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
      const code = `${prefix}${suffix}`;
      const existing = await this.prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });

      if (!existing) {
        return code;
      }
    }

    throw new BadRequestException('Could not generate referral code');
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }
}
