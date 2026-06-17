import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { DiscountType, UserRole } from '../../../generated/prisma/enums';
import { ensureAdmin } from '../../common/helpers/role-check.helper';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplyCouponDto } from './dto/apply-coupon.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@Injectable()
export class CouponsService {
  private readonly couponInclude: Prisma.CouponInclude = {
    _count: { select: { redemptions: true, orders: true } },
  };

  constructor(private readonly prisma: PrismaService) {}

  async create(adminId: string, dto: CreateCouponDto) {
    await ensureAdmin(this.prisma, adminId);
    this.assertValidDateRange(dto.startsAt, dto.expiresAt);

    const coupon = await this.prisma.coupon.create({
      data: {
        code: this.normalizeCode(dto.code),
        description: dto.description,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minOrderAmount: dto.minOrderAmount,
        maxDiscount: dto.maxDiscount,
        usageLimit: dto.usageLimit,
        perUserLimit: dto.perUserLimit ?? 1,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      include: this.couponInclude,
    });

    return {
      message: 'Coupon created',
      data: coupon,
    };
  }

  async findByCode(code: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: this.normalizeCode(code) },
      include: this.couponInclude,
    });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    return {
      message: 'Coupon retrieved',
      data: coupon,
    };
  }

  async validate(dto: ValidateCouponDto) {
    const result = await this.getValidationResult(
      dto.code,
      dto.orderAmount,
      dto.userId,
    );

    return {
      message: 'Coupon validated',
      data: result,
    };
  }

  async apply(userId: string, dto: ApplyCouponDto) {
    const validation = await this.getValidationResult(
      dto.code,
      dto.orderAmount,
      userId,
    );

    if (
      !validation.valid ||
      !validation.coupon ||
      validation.discount === undefined
    ) {
      throw new BadRequestException(validation.reason ?? 'Coupon is not valid');
    }

    const coupon = validation.coupon;
    const discount = validation.discount;

    if (!dto.orderId) {
      return {
        message: 'Coupon applied',
        data: validation,
      };
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        buyerId: userId,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.couponId) {
      throw new BadRequestException('Order already has a coupon applied');
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const redemption = await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId,
          orderId: order.id,
          discount,
        },
      });

      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });

      const totalBeforeDiscount =
        Number(order.subtotal) + Number(order.shippingFee) + Number(order.tax);
      const total = Math.max(0, totalBeforeDiscount - discount);

      const orderWithCoupon = await tx.order.update({
        where: { id: order.id },
        data: {
          couponId: coupon.id,
          discount,
          total,
        },
      });

      return { order: orderWithCoupon, redemption };
    });

    return {
      message: 'Coupon applied',
      data: {
        ...validation,
        order: updatedOrder.order,
        redemption: updatedOrder.redemption,
      },
    };
  }

  private async getValidationResult(
    code: string,
    orderAmount: number,
    userId?: string,
  ) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: this.normalizeCode(code) },
    });

    if (!coupon) {
      return { valid: false, reason: 'Coupon not found' };
    }

    const now = new Date();

    if (!coupon.isActive) {
      return { valid: false, reason: 'Coupon is inactive', coupon };
    }

    if (coupon.startsAt && coupon.startsAt > now) {
      return { valid: false, reason: 'Coupon is not active yet', coupon };
    }

    if (coupon.expiresAt && coupon.expiresAt < now) {
      return { valid: false, reason: 'Coupon has expired', coupon };
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return { valid: false, reason: 'Coupon usage limit reached', coupon };
    }

    const minOrderAmount = Number(coupon.minOrderAmount ?? 0);

    if (orderAmount < minOrderAmount) {
      return {
        valid: false,
        reason: `Minimum order amount is ${minOrderAmount}`,
        coupon,
      };
    }

    if (userId) {
      await this.ensureActiveUser(userId);

      const redemptionCount = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });

      if (redemptionCount >= coupon.perUserLimit) {
        return {
          valid: false,
          reason: 'Coupon per-user limit reached',
          coupon,
        };
      }
    }

    const discount = this.calculateDiscount(coupon, orderAmount);

    return {
      valid: true,
      coupon,
      discount,
      totalAfterDiscount: Math.max(0, orderAmount - discount),
    };
  }

  private calculateDiscount(
    coupon: {
      discountType: DiscountType;
      discountValue: Prisma.Decimal;
      maxDiscount: Prisma.Decimal | null;
    },
    orderAmount: number,
  ): number {
    const value = Number(coupon.discountValue);
    const discount =
      coupon.discountType === DiscountType.PERCENTAGE
        ? (orderAmount * value) / 100
        : value;
    const maxDiscount =
      coupon.maxDiscount === null ? undefined : Number(coupon.maxDiscount);

    return Math.min(orderAmount, maxDiscount ?? discount, discount);
  }

  private async ensureActiveUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive || user.role === UserRole.ADMIN) {
      throw new BadRequestException('Coupon can only be used by active buyers');
    }
  }

  private assertValidDateRange(startsAt?: string, expiresAt?: string): void {
    if (!startsAt || !expiresAt) {
      return;
    }

    if (new Date(startsAt) >= new Date(expiresAt)) {
      throw new BadRequestException('Coupon start date must be before expiry');
    }
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }
}
