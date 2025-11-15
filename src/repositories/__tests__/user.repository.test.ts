import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserRepository } from '../user.repository';
import prisma from '@/lib/prisma';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('UserRepository', () => {
  let repository: UserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new UserRepository();
  });

  describe('findById', () => {
    it('사용자를 조회해야 함', async () => {
      const mockUser = {
        id: 'user1',
        name: 'Test User',
        email: 'test@example.com',
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await repository.findById('user1');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user1' },
      });
    });

    it('존재하지 않는 사용자는 null을 반환해야 함', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findDetailsById', () => {
    it('상세 정보를 포함하여 사용자를 조회해야 함', async () => {
      const mockUser = {
        id: 'user1',
        name: 'Test User',
        email: 'test@example.com',
        roles: [
          {
            role: {
              id: 'role1',
              name: 'USER',
              permissions: [],
            },
          },
        ],
        clients: [],
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await repository.findDetailsById('user1');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user1' },
        include: expect.objectContaining({
          roles: expect.any(Object),
          clients: expect.any(Object),
        }),
      });
    });
  });
});


