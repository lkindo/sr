import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '@/services/user.service';
import { UserRepository } from '@/repositories/user.repository';
import { ValidationError, BusinessRuleError, NotFoundError } from '@/lib/errors';

// Mock dependencies
vi.mock('@/repositories/user.repository');
vi.mock('@/repositories/role.repository');
vi.mock('@/repositories/client.repository');
vi.mock('@/lib/redis-cache', () => ({
  invalidateCachePattern: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed'),
  compare: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    sR: { findMany: vi.fn(), count: vi.fn() },
    sRActivity: { count: vi.fn() },
    sRComment: { count: vi.fn() },
    sRStatusHistory: { count: vi.fn() },
    $transaction: vi.fn((cb) => cb({
      user: { create: vi.fn().mockResolvedValue({ id: 'u1' }), findUniqueOrThrow: vi.fn() },
      role: { findFirst: vi.fn() },
      userRole: { createMany: vi.fn() },
      userClient: { createMany: vi.fn() }
    })),
  }
}));

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRepo = new UserRepository();
    userService = new UserService(mockUserRepo);
  });

  describe('getAllUsers', () => {
    it('calls findAllWithFilters when filters are provided', async () => {
      mockUserRepo.findAllWithFilters.mockResolvedValue([[], 0]);
      await userService.getAllUsers({ search: 'test' });
      expect(mockUserRepo.findAllWithFilters).toHaveBeenCalled();
    });

    it('calls findAllPaginated when no filters are provided', async () => {
      mockUserRepo.findAllPaginated.mockResolvedValue([[], 0]);
      await userService.getAllUsers({});
      expect(mockUserRepo.findAllPaginated).toHaveBeenCalled();
    });
  });

  describe('deactivateUser', () => {
    it('throws ValidationError if user has active SRs', async () => {
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.sR.findMany).mockResolvedValue([{ id: 'sr-1', srNumber: 'SR1', status: 'IN_PROGRESS' }] as any);

      await expect(userService.deactivateUser('u1'))
        .rejects.toThrow(ValidationError);
    });

    it('deactivates user if no active SRs', async () => {
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.sR.findMany).mockResolvedValue([]);
      mockUserRepo.deactivateUser.mockResolvedValue({ id: 'u1' });

      const result = await userService.deactivateUser('u1');
      expect(result.id).toBe('u1');
      expect(mockUserRepo.deactivateUser).toHaveBeenCalledWith('u1');
    });
  });

  describe('hardDeleteUser', () => {
    it('throws BusinessRuleError if related SR data exists', async () => {
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.sR.count).mockResolvedValue(1);

      await expect(userService.hardDeleteUser('u1')).rejects.toThrow(BusinessRuleError);
    });

    it('throws BusinessRuleError if activity exists', async () => {
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.sR.count).mockResolvedValue(0);
      vi.mocked(prisma.sRActivity.count).mockResolvedValue(1);

      await expect(userService.hardDeleteUser('u1')).rejects.toThrow(BusinessRuleError);
    });

    it('deletes user if no related data exists', async () => {
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.sR.count).mockResolvedValue(0);
      vi.mocked(prisma.sRActivity.count).mockResolvedValue(0);
      vi.mocked(prisma.sRComment.count).mockResolvedValue(0);
      vi.mocked(prisma.sRStatusHistory.count).mockResolvedValue(0);
      mockUserRepo.delete.mockResolvedValue({ id: 'u1' });

      const result = await userService.hardDeleteUser('u1');
      expect(result.id).toBe('u1');
    });
  });

  describe('createUser', () => {
    it('creates user with userType based roles', async () => {
      const { default: prisma } = await import('@/lib/prisma');
      const txMock = {
        user: { create: vi.fn().mockResolvedValue({ id: 'u1' }), findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1' }) },
        role: { findFirst: vi.fn().mockResolvedValue({ id: 'r1' }) },
        userRole: { createMany: vi.fn() },
        userClient: { createMany: vi.fn() }
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb) => cb(txMock));

      await userService.createUser({
        email: 't@t.com', name: 'N', password: 'P', userType: 'ENGINEER'
      });

      expect(txMock.role.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { name: 'ENGINEER' }
      }));
      expect(txMock.userRole.createMany).toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('throws error if user not found', async () => {
      mockUserRepo.findById.mockResolvedValue(null);
      await expect(userService.changePassword('u1', 'old', 'new')).rejects.toThrow(NotFoundError);
    });

    it('throws error if current password mismatch', async () => {
      mockUserRepo.findById.mockResolvedValue({ id: 'u1', password: 'hashed-old' });
      const { compare } = await import('bcryptjs');
      vi.mocked(compare).mockResolvedValue(false as any);

      await expect(userService.changePassword('u1', 'wrong', 'new')).rejects.toThrow(ValidationError);
    });
  });
});
