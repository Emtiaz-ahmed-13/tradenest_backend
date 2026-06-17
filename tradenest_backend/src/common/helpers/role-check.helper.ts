import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';

export async function ensureUserRole(
  prisma: PrismaService,
  userId: string,
  roles: UserRole[],
): Promise<UserRole> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  if (!user.isActive) {
    throw new ForbiddenException('Account is suspended');
  }

  if (!roles.includes(user.role)) {
    throw new ForbiddenException('Insufficient permissions');
  }

  return user.role;
}

export async function ensureAdminOrModerator(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  await ensureUserRole(prisma, userId, [UserRole.ADMIN, UserRole.MODERATOR]);
}

export async function ensureAdmin(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  await ensureUserRole(prisma, userId, [UserRole.ADMIN]);
}

export async function ensureSeller(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isActive: true,
      sellerProfile: { select: { id: true } },
    },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  if (!user.isActive) {
    throw new ForbiddenException('Account is suspended');
  }

  if (user.role !== UserRole.SELLER && user.role !== UserRole.ADMIN) {
    throw new ForbiddenException('Seller account required');
  }

  if (user.role === UserRole.SELLER && !user.sellerProfile) {
    throw new ForbiddenException('Complete seller onboarding first');
  }
}
