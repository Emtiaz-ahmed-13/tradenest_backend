import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { SellerOnboardingDto } from './dto/seller-onboarding.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  private readonly userSelect = {
    id: true,
    name: true,
    email: true,
    emailVerified: true,
    image: true,
    phone: true,
    role: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    sellerProfile: {
      select: {
        id: true,
        shopName: true,
        slug: true,
        description: true,
        rating: true,
        totalSales: true,
        isVerified: true,
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.userSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      message: 'Profile retrieved',
      data: user,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: dto,
        select: this.userSelect,
      });

      return {
        message: 'Profile updated',
        data: user,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Phone number is already in use');
      }

      throw error;
    }
  }

  async listAddresses(userId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      message: 'Addresses retrieved',
      data: addresses,
    };
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    const shouldSetDefault =
      dto.isDefault ??
      (await this.prisma.address.count({ where: { userId } })) === 0;

    const data = {
      ...dto,
      country: dto.country ?? 'BD',
      isDefault: shouldSetDefault,
      userId,
    };

    const address = shouldSetDefault
      ? await this.prisma.$transaction(async (tx) => {
          await tx.address.updateMany({
            where: { userId },
            data: { isDefault: false },
          });

          return tx.address.create({ data });
        })
      : await this.prisma.address.create({ data });

    return {
      message: 'Address created',
      data: address,
    };
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    await this.ensureAddressOwnership(userId, addressId);

    const address = dto.isDefault
      ? await this.prisma.$transaction(async (tx) => {
          await tx.address.updateMany({
            where: { userId },
            data: { isDefault: false },
          });

          return tx.address.update({
            where: { id: addressId },
            data: {
              ...dto,
              isDefault: true,
            },
          });
        })
      : await this.prisma.address.update({
          where: { id: addressId },
          data: dto,
        });

    return {
      message: 'Address updated',
      data: address,
    };
  }

  async deleteAddress(userId: string, addressId: string) {
    const existingAddress = await this.ensureAddressOwnership(
      userId,
      addressId,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: addressId } });

      if (existingAddress.isDefault) {
        const nextDefault = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });

        if (nextDefault) {
          await tx.address.update({
            where: { id: nextDefault.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return {
      message: 'Address deleted',
      data: { id: addressId },
    };
  }

  async onboardSeller(userId: string, dto: SellerOnboardingDto) {
    const existingProfile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      throw new ConflictException('Seller profile already exists');
    }

    const slug = await this.createUniqueSellerSlug(dto.shopName);

    const [user, sellerProfile] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { role: UserRole.SELLER },
        select: this.userSelect,
      }),
      this.prisma.sellerProfile.create({
        data: {
          userId,
          shopName: dto.shopName,
          slug,
          description: dto.description,
        },
      }),
    ]);

    return {
      message: 'Seller onboarding completed',
      data: {
        user,
        sellerProfile,
      },
    };
  }

  private async ensureAddressOwnership(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
      },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }

  private async createUniqueSellerSlug(shopName: string): Promise<string> {
    const baseSlug =
      shopName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'shop';

    let slug = baseSlug;
    let suffix = 1;

    while (await this.prisma.sellerProfile.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    return slug;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
