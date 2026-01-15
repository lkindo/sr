import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRepository } from '../user.repository';
import prisma from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('UserRepository - Filtering and Brach Coverage', () => {
  let repository: UserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new UserRepository();
  });

  describe('findAllWithFilters', () => {
    it('should apply search filter for name and email', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      await repository.findAllWithFilters({ search: 'test' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: 'test', mode: 'insensitive' } },
            { email: { contains: 'test', mode: 'insensitive' } },
          ]
        })
      }));
    });

    it('should apply isActive filter', async () => {
      await repository.findAllWithFilters({ isActive: 'true' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ isActive: true })
      }));

      await repository.findAllWithFilters({ isActive: 'false' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ isActive: false })
      }));
    });

    it('should apply clientId filter (assigned)', async () => {
      await repository.findAllWithFilters({ clientId: 'client-1' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          clients: { some: { clientId: 'client-1' } }
        })
      }));
    });

    it('should apply clientId filter (unassigned)', async () => {
      await repository.findAllWithFilters({ clientId: 'unassigned' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          clients: { none: {} }
        })
      }));
    });

    it('should apply roleId filter', async () => {
      await repository.findAllWithFilters({ roleId: 'role-1' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          roles: { some: { roleId: 'role-1' } }
        })
      }));
    });

    it('should apply userType filter (CLIENT)', async () => {
      const mockUsers = [
        { id: '1', clients: [{ client: { id: 'c1' } }], roles: [] },
        { id: '2', clients: [], roles: [] }
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);
      vi.mocked(prisma.user.count).mockResolvedValue(2);

      const [users] = await repository.findAllWithFilters({ userType: 'CLIENT' });

      expect(users.length).toBe(1);
      expect(users[0].id).toBe('1');
    });
  });

  describe('updateClientAssociations', () => {
    it('should throw error if attempting to assign clients to system team (ADMIN)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        roles: [{ role: { name: 'ADMIN' } }]
      } as any);

      await expect(repository.updateClientAssociations('user-1', ['client-1']))
        .rejects.toThrow('시스템 운영팀(ADMIN, MANAGER, ENGINEER)은 고객사를 할당할 수 없습니다');
    });

    it('should allow assigning clients to non-system team users', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        roles: [{ role: { name: 'USER' } }]
      } as any);

      await repository.updateClientAssociations('user-1', ['client-1']);

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'user-1' },
        data: {
          clients: expect.objectContaining({
            create: [{ clientId: 'client-1' }]
          })
        }
      }));
    });
  });
});
