import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/prisma';
import { UserService } from '@/services/user.service';

// Mock dependencies
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

describe('UserService Security', () => {
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    userService = new UserService();
  });

  describe('Password Leakage Prevention', () => {
    it('getAllUsers should NOT return password field', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'u1', password: 'secret-hash', clients: [], roles: [] } as any
      ]);
      vi.mocked(prisma.user.count).mockResolvedValue(1);

      const result = await userService.getAllUsers({});

      // If this fails, it means password is being leaked
      expect((result.data[0] as any).password).toBeUndefined();
    });

    it('createUser should NOT return password field', async () => {
        const txMock = {
          user: {
            create: vi.fn().mockResolvedValue({ id: 'u1', password: 'secret-hash' }),
            findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', password: 'secret-hash', roles: [], clients: [] }),
          },
          role: { findFirst: vi.fn().mockResolvedValue({ id: 'r1', name: 'ENGINEER' }) },
          userRole: { createMany: vi.fn() },
          userClient: { createMany: vi.fn() },
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

        const result = await userService.createUser({
          email: 'test@example.com',
          name: 'Test User',
          password: 'password123',
          userType: 'ENGINEER',
        });

        expect((result as any).password).toBeUndefined();
    });

    it('updateUser should NOT return password field', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'u1',
        password: 'secret-hash',
        clients: [],
      } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ roles: [] } as any); // for role check

      const result = await userService.updateUser('u1', { name: 'Updated' });

      expect((result as any).password).toBeUndefined();
    });

    it('changePassword should NOT return password field', async () => {
       vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        password: 'old-hash',
      } as any);
      const { compare } = await import('bcryptjs');
      vi.mocked(compare).mockResolvedValue(true as any);

      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'u1',
        password: 'new-hash',
      } as any);

      const result = await userService.changePassword('u1', 'old', 'new');

      expect((result as any).password).toBeUndefined();
    });
  });
});
