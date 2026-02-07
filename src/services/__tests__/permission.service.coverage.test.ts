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
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        roles: [{ role: { name: 'ADMIN', permissions: [] } }],
      } as any);
      expect(await permissionService.checkRole('u1', 'ADMIN')).toBe(true);
    });

    it('returns false if user does not have role', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        roles: [{ role: { name: 'USER', permissions: [] } }],
      } as any);
      expect(await permissionService.checkRole('u1', 'ADMIN')).toBe(false);
    });

    it('returns false if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      expect(await permissionService.checkRole('u1', 'ADMIN')).toBe(false);
    });
  });

  describe('requireRole', () => {
    it('resolves if user has role', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        roles: [{ role: { name: 'ADMIN', permissions: [] } }],
      } as any);
      await expect(permissionService.requireRole('u1', 'ADMIN')).resolves.not.toThrow();
    });

    it('throws Error if user does not have role', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        roles: [],
      } as any);
      await expect(permissionService.requireRole('u1', 'ADMIN')).rejects.toThrow(
        '필요한 역할이 없습니다'
      );
    });
  });

  describe('getUserRoles', () => {
    it('returns user roles', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        roles: [{ role: { id: 'r1', name: 'ADMIN', permissions: [] } }],
      } as any);
      const roles = await permissionService.getUserRoles('u1');
      expect(roles).toHaveLength(1);
      expect(roles[0].name).toBe('ADMIN');
    });

    it('returns empty array if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      expect(await permissionService.getUserRoles('u1')).toHaveLength(0);
    });
  });

  describe('requirePermission', () => {
    it('resolves if user has permission', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        isActive: true,
        roles: [{ role: { name: 'ADMIN', permissions: [] } }], // ADMIN has all perms
      } as any);
      await expect(permissionService.requirePermission('u1', 'SR:CREATE')).resolves.not.toThrow();
    });

    it('throws ForbiddenError if user lacks permission', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        isActive: true,
        roles: [],
      } as any);
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
        {
          id: 'u2',
          name: 'U2',
          email: 'e2',
          roles: [],
        },
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);

      const result = await permissionService.getUsersWithPermissions(['SR:CREATE', 'SR:READ']);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('u1');
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
    it('returns false if user not active', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ isActive: false } as any);
      expect(await permissionService.checkPermission('u1', 'A:B')).toBe(false);
    });

    it('returns false if invalid permission format', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ isActive: true, roles: [] } as any);
      expect(await permissionService.checkPermission('u1', 'INVALID')).toBe(false);
    });
  });
});
