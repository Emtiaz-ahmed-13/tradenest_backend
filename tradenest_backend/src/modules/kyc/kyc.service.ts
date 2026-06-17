import { Injectable, NotFoundException } from '@nestjs/common';
import { KycStatus } from '../../../generated/prisma/enums';
import {
  ensureAdmin,
  ensureSeller,
} from '../../common/helpers/role-check.helper';
import { AuditService } from '../../common/services/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { SubmitKycDto } from './dto/submit-kyc.dto';

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async submit(userId: string, dto: SubmitKycDto) {
    await ensureSeller(this.prisma, userId);

    const verification = await this.prisma.kycVerification.upsert({
      where: { userId },
      create: {
        userId,
        status: KycStatus.PENDING,
        nidNumber: dto.nidNumber,
        frontImageUrl: dto.frontImageUrl,
        backImageUrl: dto.backImageUrl,
        selfieUrl: dto.selfieUrl,
      },
      update: {
        status: KycStatus.PENDING,
        nidNumber: dto.nidNumber,
        frontImageUrl: dto.frontImageUrl,
        backImageUrl: dto.backImageUrl,
        selfieUrl: dto.selfieUrl,
        adminNote: null,
        reviewedAt: null,
      },
    });

    await this.prisma.sellerProfile.update({
      where: { userId },
      data: { isVerified: false },
    });

    return { message: 'KYC submitted', data: verification };
  }

  async getStatus(userId: string) {
    await ensureSeller(this.prisma, userId);

    const verification = await this.prisma.kycVerification.findUnique({
      where: { userId },
    });

    return {
      message: 'KYC status retrieved',
      data: verification ?? { status: 'NOT_SUBMITTED' },
    };
  }

  async approve(adminId: string, verificationId: string, dto: ReviewKycDto) {
    await ensureAdmin(this.prisma, adminId);

    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
    });

    if (!verification) {
      throw new NotFoundException('KYC verification not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextVerification = await tx.kycVerification.update({
        where: { id: verificationId },
        data: {
          status: KycStatus.APPROVED,
          adminNote: dto.adminNote,
          reviewedAt: new Date(),
        },
      });

      await tx.sellerProfile.update({
        where: { userId: verification.userId },
        data: { isVerified: true },
      });

      return nextVerification;
    });

    await this.auditService.log({
      actorId: adminId,
      action: 'kyc.approve',
      entityType: 'KycVerification',
      entityId: verificationId,
      metadata: { userId: verification.userId },
    });

    return { message: 'KYC approved', data: updated };
  }

  async reject(adminId: string, verificationId: string, dto: ReviewKycDto) {
    await ensureAdmin(this.prisma, adminId);

    const verification = await this.prisma.kycVerification.findUnique({
      where: { id: verificationId },
    });

    if (!verification) {
      throw new NotFoundException('KYC verification not found');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextVerification = await tx.kycVerification.update({
        where: { id: verificationId },
        data: {
          status: KycStatus.REJECTED,
          adminNote: dto.adminNote,
          reviewedAt: new Date(),
        },
      });

      await tx.sellerProfile.update({
        where: { userId: verification.userId },
        data: { isVerified: false },
      });

      return nextVerification;
    });

    await this.auditService.log({
      actorId: adminId,
      action: 'kyc.reject',
      entityType: 'KycVerification',
      entityId: verificationId,
      metadata: { userId: verification.userId, reason: dto.adminNote },
    });

    return { message: 'KYC rejected', data: updated };
  }
}
