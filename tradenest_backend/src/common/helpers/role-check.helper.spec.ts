import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums';
import { ensureAdmin, ensureUserRole } from './role-check.helper';

describe('role-check.helper', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows matching roles', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: UserRole.ADMIN,
      isActive: true,
    });

    const role = await ensureUserRole(prisma as never, 'u1', [UserRole.ADMIN]);

    expect(role).toBe(UserRole.ADMIN);
  });

  it('blocks suspended users', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: UserRole.ADMIN,
      isActive: false,
    });

    await expect(ensureAdmin(prisma as never, 'u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
