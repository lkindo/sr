import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateAndAuthorize } from '@/lib/action-helpers';
import { PERMISSIONS } from '@/lib/permission-helpers';

// Mock dependencies BEFORE imports
vi.mock('@/lib/action-helpers', () => ({
  authenticateAndAuthorize: vi.fn(),
  validateWithSchema: vi.fn((data) => ({ success: true, data })),
  getAuthenticatedSession: vi.fn(),
}));

vi.mock('@/services/role.service', () => {
  const RoleService = vi.fn();
  RoleService.prototype.getAllRoles = vi.fn().mockResolvedValue([]);
  RoleService.prototype.getRoleById = vi.fn().mockResolvedValue({ id: 'role-1', name: 'Role 1' });
  return { RoleService };
});

// Import actions AFTER mocks
import { getAllRolesAction, getRoleAction } from '../role.actions';

describe('Role Actions Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllRolesAction', () => {
    it('should require authentication and authorization', async () => {
      await getAllRolesAction();
      expect(authenticateAndAuthorize).toHaveBeenCalledWith(PERMISSIONS.ROLE.READ);
    });
  });

  describe('getRoleAction', () => {
    it('should require authentication and authorization', async () => {
      await getRoleAction('role-1');
      expect(authenticateAndAuthorize).toHaveBeenCalledWith(PERMISSIONS.ROLE.READ);
    });
  });
});
