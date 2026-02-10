import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';

import { PermissionService } from '../permission.service';

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    permission: {
      findMany: vi.fn(),
    },
    userRole: {
      count: vi.fn(),
    },
  },
}));

describe('PermissionService', () => {
  let permissionService: PermissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    permissionService = new PermissionService();
  });

  describe('getAllPermissions', () => {
    it('모든 권한을 반환해야 함', async () => {
      const mockPermissions = [
        { id: 'perm1', resource: 'SR', action: 'CREATE' },
        { id: 'perm2', resource: 'SR', action: 'READ' },
      ];

      vi.mocked(prisma.permission.findMany).mockResolvedValue(mockPermissions as any);

      const result = await permissionService.getAllPermissions();

      expect(result).toEqual(mockPermissions);
      expect(prisma.permission.findMany).toHaveBeenCalled();
    });
  });

  describe('checkPermission', () => {
    it('ADMIN 역할은 모든 권한을 가져야 함', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(1); // count > 0

      const result = await permissionService.checkPermission('user1', 'any:permission');

      expect(result).toBe(true);
      expect(prisma.userRole.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user1',
            role: expect.objectContaining({
              OR: expect.arrayContaining([{ name: 'ADMIN' }]),
            }),
          }),
        })
      );
    });

    it('권한이 있으면 true를 반환해야 함', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(1);

      const result = await permissionService.checkPermission('user1', 'SR:CREATE');

      expect(result).toBe(true);
    });

    it('권한이 없으면 false를 반환해야 함', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(0);

      const result = await permissionService.checkPermission('user1', 'SR:CREATE');

      expect(result).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('사용자의 모든 권한을 반환해야 함', async () => {
      const mockUser = {
        id: 'user1',
        isActive: true,
        roles: [
          {
            role: {
              permissions: [
                {
                  permission: {
                    id: 'perm1',
                    resource: 'SR',
                    action: 'CREATE',
                  },
                },
                {
                  permission: {
                    id: 'perm2',
                    resource: 'SR',
                    action: 'READ',
                  },
                },
              ],
            },
          },
        ],
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      const result = await permissionService.getUserPermissions('user1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('perm1');
      expect(result[1].id).toBe('perm2');
    });
  });
});
