import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/prisma';
import { UserService } from '@/services/user.service';

// Mock dependencies
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed_password'),
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
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

describe('UserService Security', () => {
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    userService = new UserService();
  });

  describe('createUser', () => {
    it('returns user object WITHOUT password (secure)', async () => {
      const mockUserWithPassword = {
        id: 'u1',
        email: 't@t.com',
        name: 'Test',
        password: 'hashed_password', // This shouldn't be returned
        roles: [],
        clients: [],
      };

      const txMock = {
        user: {
          create: vi.fn().mockResolvedValue({ id: 'u1' }),
          findUnique: vi.fn().mockResolvedValue(mockUserWithPassword),
          findUniqueOrThrow: vi.fn().mockResolvedValue(mockUserWithPassword),
        },
        role: { findFirst: vi.fn().mockResolvedValue({ id: 'r1', name: 'ENGINEER' }) },
        userRole: { createMany: vi.fn() },
        userClient: { createMany: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

      const result = await userService.createUser({
        email: 't@t.com',
        name: 'Test',
        password: 'password',
        userType: 'ENGINEER',
      });

      // Expect password to be ABSENT (verifying the fix)
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('updateUser', () => {
    it('returns user object WITHOUT password', async () => {
      const mockUserWithPassword = {
        id: 'u1',
        email: 't@t.com',
        name: 'Test',
        password: 'hashed_password',
      };
      vi.mocked(prisma.user.update).mockResolvedValue(mockUserWithPassword as any);

      const result = await userService.updateUser('u1', { name: 'New Name' });

      expect(result).not.toHaveProperty('password');
    });
  });
});
