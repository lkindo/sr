import { describe, it, expect } from 'vitest';
import {
  canCreateRole,
  canReadRole,
  canUpdateRole,
  canDeleteRole,
  canAssignRole,
  ensureCanUpdateRole,
  ensureCanDeleteRole,
  ensureCanAssignRole,
} from '@/lib/policies';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '@/types/session';

describe('Role Policy Functions', () => {
  const adminUser: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin User',
    image: null,
    roles: ['ADMIN'],
    permissions: [],
    clientIds: [],
  };

  const managerUser: AuthenticatedUser = {
    id: 'manager-1',
    email: 'manager@example.com',
    name: 'Manager User',
    image: null,
    roles: ['MANAGER'],
    permissions: ['ROLE:READ', 'ROLE:ASSIGN'],
    clientIds: [],
  };

  const regularUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Regular User',
    image: null,
    roles: ['USER'],
    permissions: [],
    clientIds: [],
  };

  const adminRole: Role = {
    id: 'role-1',
    name: 'ADMIN',
    description: 'Administrator role',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const customRole: Role = {
    id: 'role-2',
    name: 'CUSTOM',
    description: 'Custom role',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('canCreateRole', () => {
    it('should allow ADMIN to create roles', () => {
      expect(canCreateRole(adminUser)).toBe(true);
    });

    it('should deny regular users', () => {
      expect(canCreateRole(regularUser)).toBe(false);
    });
  });

  describe('canReadRole', () => {
    it('should allow ADMIN to read roles', () => {
      expect(canReadRole(adminUser)).toBe(true);
    });

    it('should allow users with ROLE:READ permission', () => {
      expect(canReadRole(managerUser)).toBe(true);
    });

    it('should deny regular users', () => {
      expect(canReadRole(regularUser)).toBe(false);
    });
  });

  describe('canUpdateRole', () => {
    it('should allow ADMIN to update custom roles', () => {
      expect(canUpdateRole(adminUser, customRole)).toBe(true);
    });

    it('should deny updating ADMIN role even for admins', () => {
      expect(canUpdateRole(adminUser, adminRole)).toBe(false);
    });

    it('should deny regular users', () => {
      expect(canUpdateRole(regularUser, customRole)).toBe(false);
    });
  });

  describe('canDeleteRole', () => {
    it('should allow ADMIN to delete custom roles', () => {
      expect(canDeleteRole(adminUser, customRole)).toBe(true);
    });

    it('should deny deleting system roles (ADMIN, USER, GUEST)', () => {
      expect(canDeleteRole(adminUser, adminRole)).toBe(false);

      const userRole = { ...customRole, name: 'USER' };
      expect(canDeleteRole(adminUser, userRole)).toBe(false);

      const guestRole = { ...customRole, name: 'GUEST' };
      expect(canDeleteRole(adminUser, guestRole)).toBe(false);
    });

    it('should deny regular users', () => {
      expect(canDeleteRole(regularUser, customRole)).toBe(false);
    });
  });

  describe('canAssignRole', () => {
    it('should allow ADMIN to assign ADMIN role', () => {
      expect(canAssignRole(adminUser, adminRole)).toBe(true);
    });

    it('should allow users with ROLE:ASSIGN to assign non-ADMIN roles', () => {
      expect(canAssignRole(managerUser, customRole)).toBe(true);
    });

    it('should deny non-ADMIN from assigning ADMIN role', () => {
      expect(canAssignRole(managerUser, adminRole)).toBe(false);
    });

    it('should deny regular users', () => {
      expect(canAssignRole(regularUser, customRole)).toBe(false);
    });
  });

  describe('ensureCanUpdateRole', () => {
    it('should throw specific error for ADMIN role', () => {
      expect(() => ensureCanUpdateRole(adminUser, adminRole)).toThrow('ADMIN 역할은 수정할 수 없습니다');
    });

    it('should not throw for custom roles with permission', () => {
      expect(() => ensureCanUpdateRole(adminUser, customRole)).not.toThrow();
    });
  });

  describe('ensureCanDeleteRole', () => {
    it('should throw specific error for system roles', () => {
      expect(() => ensureCanDeleteRole(adminUser, adminRole)).toThrow('시스템 역할은 삭제할 수 없습니다');
    });

    it('should not throw for custom roles with permission', () => {
      expect(() => ensureCanDeleteRole(adminUser, customRole)).not.toThrow();
    });
  });

  describe('ensureCanAssignRole', () => {
    it('should throw specific error when non-admin tries to assign ADMIN role', () => {
      expect(() => ensureCanAssignRole(managerUser, adminRole)).toThrow('ADMIN 역할 할당은 ADMIN만 가능합니다');
    });

    it('should not throw for authorized assignments', () => {
      expect(() => ensureCanAssignRole(adminUser, adminRole)).not.toThrow();
      expect(() => ensureCanAssignRole(managerUser, customRole)).not.toThrow();
    });
  });
});
