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
      findMany: vi.fn(),
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

  describe('checkAnyPermission', () => {
    it('should return true if user has one of the permissions', async () => {
      const mockUserRoles = [
        {
          role: {
            name: 'USER',
            permissions: [
              {
                permission: {
                  resource: 'SR',
                  action: 'READ',
                },
              },
            ],
          },
        },
      ];
      vi.mocked(prisma.userRole.findMany).mockResolvedValue(mockUserRoles as any);

      const result = await permissionService.checkAnyPermission('user1', [
        { resource: 'SR', action: 'DELETE' }, // Missing
        { resource: 'SR', action: 'READ' },   // Present
      ]);

      expect(result).toBe(true);
      expect(prisma.userRole.findMany).toHaveBeenCalledTimes(1);
    });

    it('should return false if user has none of the permissions', async () => {
      const mockUserRoles = [
        {
          role: {
            name: 'USER',
            permissions: [
              {
                permission: {
                  resource: 'SR',
                  action: 'READ',
                },
              },
            ],
          },
        },
      ];
      vi.mocked(prisma.userRole.findMany).mockResolvedValue(mockUserRoles as any);

      const result = await permissionService.checkAnyPermission('user1', [
        { resource: 'SR', action: 'DELETE' },
      ]);

      expect(result).toBe(false);
    });

    it('should return true if user is ADMIN', async () => {
      const mockUserRoles = [
        {
          role: {
            name: 'ADMIN',
            permissions: [],
          },
        },
      ];
      vi.mocked(prisma.userRole.findMany).mockResolvedValue(mockUserRoles as any);

      const result = await permissionService.checkAnyPermission('user1', [
        { resource: 'SR', action: 'DELETE' },
      ]);

      expect(result).toBe(true);
    });
  });

  describe('getUserPermissions', () => {
    it('사용자의 모든 권한을 반환해야 함', async () => {
      const mockUserRoles = [
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
      ];

      vi.mocked(prisma.userRole.findMany).mockResolvedValue(mockUserRoles as any);

      const result = await permissionService.getUserPermissions('user1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('perm1');
      expect(result[1].id).toBe('perm2');
      expect(prisma.userRole.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: { userId: 'user1' }
      }));
    });
  });
});
