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
    userClient: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
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

  describe('findByEmail', () => {
    it('이메일로 사용자를 조회해야 함', async () => {
      const mockUser = {
        id: 'user1',
        name: 'Test User',
        email: 'test@example.com',
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await repository.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'test@example.com' },
        })
      );
    });

    it('존재하지 않는 이메일은 null을 반환해야 함', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await repository.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByClientId', () => {
    it('고객사에 속한 사용자 목록을 반환해야 함', async () => {
      const mockUsers = [
        { id: 'user1', name: 'User 1' },
        { id: 'user2', name: 'User 2' },
      ];

      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);

      const result = await repository.findByClientId('client1');

      expect(result).toEqual(mockUsers);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clients: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('updatePassword', () => {
    it('비밀번호를 업데이트해야 함', async () => {
      const mockUpdatedUser = {
        id: 'user1',
        name: 'Test User',
        password: 'newhashed',
      };

      vi.mocked(prisma.user.update).mockResolvedValue(mockUpdatedUser as any);

      const result = await repository.updatePassword('user1', 'newhashed');

      expect(result).toEqual(mockUpdatedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user1' },
        data: { password: 'newhashed' },
      });
    });
  });

  describe('updateProfile', () => {
    it('프로필 정보를 업데이트해야 함', async () => {
      const mockUpdatedUser = {
        id: 'user1',
        name: 'Updated Name',
        email: 'updated@example.com',
      };

      vi.mocked(prisma.user.update).mockResolvedValue(mockUpdatedUser as any);

      const result = await repository.updateProfile('user1', {
        name: 'Updated Name',
        email: 'updated@example.com',
      });

      expect(result).toEqual(mockUpdatedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user1' },
        data: { name: 'Updated Name', email: 'updated@example.com' },
      });
    });
  });

  describe('activateUser', () => {
    it('사용자를 활성화해야 함', async () => {
      const mockUser = { id: 'user1', isActive: true };

      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as any);

      const result = await repository.activateUser('user1');

      expect(result.isActive).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user1' },
        data: { isActive: true },
      });
    });
  });

  describe('deactivateUser', () => {
    it('사용자를 비활성화해야 함', async () => {
      const mockUser = { id: 'user1', isActive: false };

      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as any);

      const result = await repository.deactivateUser('user1');

      expect(result.isActive).toBe(false);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user1' },
        data: { isActive: false },
      });
    });
  });

  describe('findAllPaginated', () => {
    it('페이지네이션된 사용자 목록을 반환해야 함', async () => {
      const mockUsers = [{ id: 'user1' }, { id: 'user2' }];
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);
      vi.mocked(prisma.user.count).mockResolvedValue(50);

      const [users, count] = await repository.findAllPaginated({ skip: 0, take: 10 });

      expect(users).toEqual(mockUsers);
      expect(count).toBe(50);
    });
  });

  describe('findUserIdsByRoles', () => {
    it('역할별 사용자 ID 목록을 반환해야 함', async () => {
      const mockUsers = [
        { id: 'user1' },
        { id: 'user2' },
      ];

      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);

      const result = await repository.findUserIdsByRoles(['ADMIN', 'MANAGER']);

      expect(result).toEqual(['user1', 'user2']);
    });
  });

  describe('findUsersByRoles', () => {
    it('역할별 사용자 목록을 반환해야 함', async () => {
      const mockUsers = [
        { id: 'user1', name: 'Admin', notificationPreference: { emailSRCreated: true } },
      ];

      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);

      const result = await repository.findUsersByRoles(['ADMIN']);

      expect(result).toEqual(mockUsers);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            roles: expect.any(Object),
          }),
        })
      );
    });
  });
});
