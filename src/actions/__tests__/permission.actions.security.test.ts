import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateAndAuthorize } from '@/lib/action-helpers';
import { PERMISSIONS } from '@/lib/permission-helpers';

// Mock dependencies BEFORE imports
vi.mock('@/lib/action-helpers', () => ({
  authenticateAndAuthorize: vi.fn(),
  getAuthenticatedSession: vi.fn(),
}));

vi.mock('@/services/permission.service', () => {
  const PermissionService = vi.fn();
  PermissionService.prototype.getAllPermissions = vi.fn().mockResolvedValue([]);
  return { PermissionService };
});

// Import actions AFTER mocks
import { getAllPermissionsAction } from '../permission.actions';

describe('Permission Actions Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllPermissionsAction', () => {
    it('should require authentication and authorization', async () => {
      await getAllPermissionsAction();
      expect(authenticateAndAuthorize).toHaveBeenCalledWith(PERMISSIONS.ROLE.READ);
    });
  });
});
