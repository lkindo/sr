import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getUserPermissions,
  getUserRoles,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  hasRole,
  requirePermission,
} from '@/lib/permissions';

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  checkRole: vi.fn(),
  getUserPermissions: vi.fn(),
  getUserRoles: vi.fn(),
}));

vi.mock('@/services/permission.service', () => ({
  PermissionService: vi.fn().mockImplementation(function (this: any) {
    return mocks;
  }),
}));

describe('permissions utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasPermission', () => {
    it('should return true if permission service returns true', async () => {
      mocks.checkPermission.mockResolvedValue(true);

      const result = await hasPermission('user-1', 'SR', 'READ');
      expect(result).toBe(true);
      expect(mocks.checkPermission).toHaveBeenCalledWith('user-1', 'SR:READ');
    });

    it('should return false if permission service returns false', async () => {
      mocks.checkPermission.mockResolvedValue(false);
      const result = await hasPermission('user-1', 'SR', 'DELETE');
      expect(result).toBe(false);
    });

    it('should return false if service throws error', async () => {
      mocks.checkPermission.mockRejectedValue(new Error('DB Error'));
      const result = await hasPermission('user-1', 'SR', 'READ');
      expect(result).toBe(false);
    });
  });

  describe('requirePermission', () => {
    it('should not throw if permission is granted', async () => {
      mocks.checkPermission.mockResolvedValue(true);
      await expect(requirePermission('user-1', 'SR', 'READ')).resolves.not.toThrow();
    });

    it('should throw if permission is denied', async () => {
      mocks.checkPermission.mockResolvedValue(false);
      await expect(requirePermission('user-1', 'SR', 'DELETE')).rejects.toThrow('권한이 없습니다');
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true if at least one permission is granted', async () => {
      mocks.checkPermission.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      const result = await hasAnyPermission('user-1', [
        { resource: 'SR', action: 'DELETE' },
        { resource: 'SR', action: 'READ' },
      ]);
      expect(result).toBe(true);
    });

    it('should return false if no permissions are granted', async () => {
      mocks.checkPermission.mockResolvedValue(false);

      const result = await hasAnyPermission('user-1', [
        { resource: 'SR', action: 'DELETE' },
        { resource: 'CLIENT', action: 'DELETE' },
      ]);
      expect(result).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true if all permissions are granted', async () => {
      mocks.checkRole.mockResolvedValue(false);
      mocks.getUserPermissions.mockResolvedValue([
        { resource: 'SR', action: 'CREATE', description: null },
        { resource: 'SR', action: 'READ', description: null },
      ]);

      const result = await hasAllPermissions('user-1', [
        { resource: 'SR', action: 'CREATE' },
        { resource: 'SR', action: 'READ' },
      ]);
      expect(result).toBe(true);
    });

    it('should return true if user is ADMIN', async () => {
      mocks.checkRole.mockResolvedValue(true);

      const result = await hasAllPermissions('user-1', [
        { resource: 'SR', action: 'CREATE' },
        { resource: 'SR', action: 'DELETE' },
      ]);
      expect(result).toBe(true);
    });

    it('should return false if any permission is denied', async () => {
      mocks.checkRole.mockResolvedValue(false);
      mocks.getUserPermissions.mockResolvedValue([
        { resource: 'SR', action: 'CREATE', description: null },
      ]);

      const result = await hasAllPermissions('user-1', [
        { resource: 'SR', action: 'CREATE' },
        { resource: 'SR', action: 'DELETE' },
      ]);
      expect(result).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true when user has the role', async () => {
      mocks.checkRole.mockResolvedValue(true);

      const result = await hasRole('user-1', 'ADMIN');
      expect(result).toBe(true);
      expect(mocks.checkRole).toHaveBeenCalledWith('user-1', 'ADMIN');
    });

    it('should return false when user lacks the role', async () => {
      mocks.checkRole.mockResolvedValue(false);

      const result = await hasRole('user-1', 'ADMIN');
      expect(result).toBe(false);
    });

    it('should return false on service error', async () => {
      mocks.checkRole.mockRejectedValue(new Error('error'));

      const result = await hasRole('user-1', 'ADMIN');
      expect(result).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return formatted permissions with description', async () => {
      mocks.getUserPermissions.mockResolvedValue([
        { resource: 'SR', action: 'CREATE', description: 'Create SR' },
        { resource: 'SR', action: 'READ', description: null },
      ]);

      const result = await getUserPermissions('user-1');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        resource: 'SR',
        action: 'CREATE',
        description: 'Create SR',
      });
      expect(result[1].description).toBeUndefined();
    });
  });

  describe('getUserRoles', () => {
    it('should return user roles from service', async () => {
      mocks.getUserRoles.mockResolvedValue(['ADMIN', 'MANAGER']);

      const result = await getUserRoles('user-1');
      expect(result).toEqual(['ADMIN', 'MANAGER']);
      expect(mocks.getUserRoles).toHaveBeenCalledWith('user-1');
    });
  });
});
