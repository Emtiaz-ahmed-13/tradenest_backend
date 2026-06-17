import { DiscountType } from '../../../generated/prisma/enums';
import { CouponsService } from './coupons.service';

describe('CouponsService', () => {
  const prisma = {
    coupon: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    couponRedemption: {
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        role: 'BUYER',
        isActive: true,
      }),
    },
  };

  const service = new CouponsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      role: 'BUYER',
      isActive: true,
    });
  });

  it('calculates percentage discount with max cap', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      id: 'c1',
      code: 'SAVE10',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      maxDiscount: 50,
      minOrderAmount: null,
      usageLimit: null,
      usedCount: 0,
      isActive: true,
      startsAt: null,
      expiresAt: null,
      perUserLimit: 1,
    });
    prisma.couponRedemption.count.mockResolvedValue(0);

    const result = await service.validate({
      code: 'SAVE10',
      orderAmount: 1000,
      userId: 'u1',
    });

    expect(result.data.discount).toBe(50);
    expect(result.data.valid).toBe(true);
  });

  it('marks expired coupons as invalid', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      id: 'c1',
      code: 'OLD',
      discountType: DiscountType.FIXED,
      discountValue: 20,
      maxDiscount: null,
      minOrderAmount: null,
      usageLimit: null,
      usedCount: 0,
      isActive: true,
      startsAt: null,
      expiresAt: new Date('2020-01-01'),
      perUserLimit: 1,
    });

    const result = await service.validate({
      code: 'OLD',
      orderAmount: 500,
      userId: 'u1',
    });

    expect(result.data.valid).toBe(false);
    expect(result.data.reason).toBe('Coupon has expired');
  });
});
