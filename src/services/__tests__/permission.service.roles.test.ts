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
