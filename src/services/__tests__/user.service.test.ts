import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { UserService } from '@/services/user.service';

// Mock dependencies
vi.mock('@/lib/redis-cache', () => ({
  invalidateCachePattern: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed'),
  compare: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    userRole: {
      createMany: vi.fn(),
    },
    userClient: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    sR: { findMany: vi.fn(), count: vi.fn() },
    sRActivity: { count: vi.fn() },
    sRComment: { count: vi.fn() },
    sRStatusHistory: { count: vi.fn() },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    userService = new UserService();
  });

  describe('getAllUsers', () => {
    it('calls findMany with filters when search is provided', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      await userService.getAllUsers({ search: 'test' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        })
      );
    });

    it('calls findMany with pagination when no filters are provided', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      await userService.getAllUsers({});

      expect(prisma.user.findMany).toHaveBeenCalled();
    });
  });

  describe('deactivateUser', () => {
    it('throws ValidationError if user has active SRs', async () => {
      vi.mocked(prisma.sR.findMany).mockResolvedValue([
        { id: 'sr-1', srNumber: 'SR1', status: 'IN_PROGRESS' },
      ] as any);

      await expect(userService.deactivateUser('u1')).rejects.toThrow(ValidationError);
    });

    it('deactivates user if no active SRs', async () => {
      vi.mocked(prisma.sR.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1', isActive: false } as any);

      const result = await userService.deactivateUser('u1');
      expect(result.id).toBe('u1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isActive: false },
      });
    });
  });

  describe('hardDeleteUser', () => {
    it('throws BusinessRuleError if related SR data exists', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(1);

      await expect(userService.hardDeleteUser('u1')).rejects.toThrow(BusinessRuleError);
    });

    it('throws BusinessRuleError if activity exists', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(0);
      vi.mocked(prisma.sRActivity.count).mockResolvedValue(1);

      await expect(userService.hardDeleteUser('u1')).rejects.toThrow(BusinessRuleError);
    });

    it('deletes user if no related data exists', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(0);
      vi.mocked(prisma.sRActivity.count).mockResolvedValue(0);
      vi.mocked(prisma.sRComment.count).mockResolvedValue(0);
      vi.mocked(prisma.sRStatusHistory.count).mockResolvedValue(0);
      vi.mocked(prisma.user.delete).mockResolvedValue({ id: 'u1' } as any);

      const result = await userService.hardDeleteUser('u1');
      expect(result.id).toBe('u1');
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });

  describe('createUser', () => {
    it('creates user with userType based roles', async () => {
      const txMock = {
        user: {
          create: vi.fn().mockResolvedValue({ id: 'u1' }),
          findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 't@t.com' }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', email: 't@t.com' }),
        },
        role: { findFirst: vi.fn().mockResolvedValue({ id: 'r1', name: 'ENGINEER' }) },
        userRole: { createMany: vi.fn() },
        userClient: { createMany: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

      await userService.createUser({
        email: 't@t.com',
        name: 'N',
        password: 'P',
        userType: 'ENGINEER',
      });

      expect(txMock.role.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: 'ENGINEER' },
        })
      );
    });
  });

  describe('changePassword', () => {
    it('throws error if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(userService.changePassword('u1', 'old', 'new')).rejects.toThrow(NotFoundError);
    });

    it('throws error if current password mismatch', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        password: 'hashed-old',
      } as any);
      const { compare } = await import('bcryptjs');
      vi.mocked(compare).mockResolvedValue(false as any);

      await expect(userService.changePassword('u1', 'wrong', 'new')).rejects.toThrow(
        ValidationError
      );
    });
  });
});
