import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';
import { PermissionService } from '@/services/permission.service';

vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    role: { findMany: vi.fn() },
    permission: { findMany: vi.fn() },
  },
}));

describe('PermissionService Performance Optimization', () => {
  let permissionService: PermissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    permissionService = new PermissionService();
  });

  describe('getUsersWithPermissions', () => {
    it('should construct a filtered query using role IDs instead of fetching all users', async () => {
      // Mock Roles with Permissions
      const mockRoles = [
        {
          id: 'admin-role-id',
          name: 'ADMIN',
          permissions: [], // ADMIN implicitly has all permissions
        },
        {
          id: 'engineer-role-id',
          name: 'ENGINEER',
          permissions: [
            { permission: { resource: 'SR', action: 'CREATE' } },
            { permission: { resource: 'SR', action: 'READ' } },
          ],
        },
        {
          id: 'client-role-id',
          name: 'CLIENT_USER',
          permissions: [{ permission: { resource: 'SR', action: 'CREATE' } }],
        },
      ];
      vi.mocked(prisma.role.findMany).mockResolvedValue(mockRoles as any);

      // Mock Users (empty result is fine, we just check the query structure)
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      const requiredPermissions = ['SR:CREATE', 'SR:READ'];
      await permissionService.getUsersWithPermissions(requiredPermissions);

      // Verify prisma.user.findMany was called with correct filtering
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            AND: expect.arrayContaining([
              // Check for SR:CREATE filter
              expect.objectContaining({
                roles: {
                  some: {
                    roleId: {
                      in: expect.arrayContaining([
                        'admin-role-id',
                        'engineer-role-id',
                        'client-role-id',
                      ]),
                    },
                  },
                },
              }),
              // Check for SR:READ filter
              expect.objectContaining({
                roles: {
                  some: {
                    roleId: {
                      in: expect.arrayContaining(['admin-role-id', 'engineer-role-id']),
                    },
                  },
                },
              }),
            ]),
          }),
          select: {
            id: true,
            name: true,
            email: true,
            // We don't need roles anymore if we filter in DB
          },
        })
      );
    });

    it('should handle empty permissions list by returning all active users', async () => {
      vi.mocked(prisma.role.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);

      await permissionService.getUsersWithPermissions([]);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        })
      );
    });
  });
});
