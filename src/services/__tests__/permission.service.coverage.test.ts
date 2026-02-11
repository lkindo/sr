import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { PermissionService } from '@/services/permission.service';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    role: { findMany: vi.fn() },
    permission: { findMany: vi.fn() },
    userRole: { count: vi.fn(), findMany: vi.fn() },
  },
}));

describe('PermissionService Coverage', () => {
  let permissionService: PermissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    permissionService = new PermissionService();
  });

  describe('checkRole', () => {
    it('returns true if user has role', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(1);
      expect(await permissionService.checkRole('u1', 'ADMIN')).toBe(true);
      expect(prisma.userRole.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'u1',
            role: { name: 'ADMIN' },
          },
        })
      );
    });

    it('returns false if user does not have role', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(0);
      expect(await permissionService.checkRole('u1', 'ADMIN')).toBe(false);
    });
  });

  describe('requireRole', () => {
    it('resolves if user has role', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(1);
      await expect(permissionService.requireRole('u1', 'ADMIN')).resolves.not.toThrow();
    });

    it('throws Error if user does not have role', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(0);
      await expect(permissionService.requireRole('u1', 'ADMIN')).rejects.toThrow(
        '필요한 역할이 없습니다'
      );
    });
  });

  describe('getUserRoles', () => {
    it('returns user roles', async () => {
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        { role: { id: 'r1', name: 'ADMIN' } },
      ] as any);
      const roles = await permissionService.getUserRoles('u1');
      expect(roles).toHaveLength(1);
      expect(roles[0].name).toBe('ADMIN');
      expect(prisma.userRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
          include: { role: true },
        })
      );
    });

    it('returns empty array if user has no roles', async () => {
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([]);
      expect(await permissionService.getUserRoles('u1')).toHaveLength(0);
    });
  });

  describe('getUserPermissions', () => {
    it('returns flattened permissions from user roles', async () => {
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        {
          role: {
            permissions: [
              { permission: { id: 'p1', resource: 'SR', action: 'CREATE' } },
              { permission: { id: 'p2', resource: 'SR', action: 'READ' } },
            ],
          },
        },
      ] as any);

      const permissions = await permissionService.getUserPermissions('u1');
      expect(permissions).toHaveLength(2);
      expect(permissions.some((p) => p.id === 'p1')).toBe(true);
      expect(permissions.some((p) => p.id === 'p2')).toBe(true);
    });

    it('deduplicates permissions', async () => {
      vi.mocked(prisma.userRole.findMany).mockResolvedValue([
        {
          role: {
            permissions: [
              { permission: { id: 'p1', resource: 'SR', action: 'READ' } },
            ],
          },
        },
        {
          role: {
            permissions: [
              { permission: { id: 'p1', resource: 'SR', action: 'READ' } }, // Duplicate
            ],
          },
        },
      ] as any);

      const permissions = await permissionService.getUserPermissions('u1');
      expect(permissions).toHaveLength(1);
      expect(permissions[0].id).toBe('p1');
    });
  });

  describe('requirePermission', () => {
    it('resolves if user has permission', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(1);
      await expect(permissionService.requirePermission('u1', 'SR:CREATE')).resolves.not.toThrow();
    });

    it('throws ForbiddenError if user lacks permission', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(0);
      await expect(permissionService.requirePermission('u1', 'SR:CREATE')).rejects.toThrow(
        ForbiddenError
      );
    });
  });

  describe('getUsersWithPermissions', () => {
    it('returns users who have all required permissions', async () => {
      // Mock Roles with Permissions
      const mockRoles = [
        {
          id: 'r1',
          name: 'ENGINEER',
          permissions: [
            { permission: { resource: 'SR', action: 'CREATE' } },
            { permission: { resource: 'SR', action: 'READ' } },
          ],
        },
      ];
      vi.mocked(prisma.role.findMany).mockResolvedValue(mockRoles as any);

      // Mock Users with Role IDs
      const mockUsers = [
        {
          id: 'u1',
          name: 'U1',
          email: 'e1',
          roles: [{ roleId: 'r1' }],
        },
        // u2 is filtered out by the DB query in the optimized implementation
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);

      const result = await permissionService.getUsersWithPermissions(['SR:CREATE', 'SR:READ']);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('u1');

      // Verify that the query was constructed correctly (optional, but good for coverage)
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.any(Array),
          }),
        })
      );
    });

    it('returns users if empty requirement', async () => {
      vi.mocked(prisma.role.findMany).mockResolvedValue([]);
      const mockUsers = [{ id: 'u1', roles: [] }];
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);
      const result = await permissionService.getUsersWithPermissions([]);
      expect(result).toHaveLength(1);
    });

  });

  describe('checkPermission', () => {
    it('returns false if user not active (simulated by count 0)', async () => {
      vi.mocked(prisma.userRole.count).mockResolvedValue(0);
      expect(await permissionService.checkPermission('u1', 'A:B')).toBe(false);
    });

    it('returns false if invalid permission format', async () => {
      expect(await permissionService.checkPermission('u1', 'INVALID')).toBe(false);
    });
  });
});
