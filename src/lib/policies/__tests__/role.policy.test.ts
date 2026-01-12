import { describe, it, expect } from 'vitest';
import { RolePolicy } from '../role.policy';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '@/types/session';

describe('RolePolicy', () => {
  const policy = new RolePolicy();

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

  describe('canCreate', () => {
    it('should allow ADMIN to create roles', () => {
      expect(policy.canCreate(adminUser)).toBe(true);
    });

    it('should deny regular users', () => {
      expect(policy.canCreate(regularUser)).toBe(false);
    });
  });

  describe('canRead', () => {
    it('should allow ADMIN to read roles', () => {
      expect(policy.canRead(adminUser)).toBe(true);
      expect(policy.canRead(adminUser, adminRole)).toBe(true);
    });

    it('should allow users with ROLE:READ permission', () => {
      expect(policy.canRead(managerUser)).toBe(true);
      expect(policy.canRead(managerUser, customRole)).toBe(true);
    });

    it('should deny regular users', () => {
      expect(policy.canRead(regularUser)).toBe(false);
    });
  });

  describe('canUpdate', () => {
    it('should allow ADMIN to update custom roles', () => {
      expect(policy.canUpdate(adminUser, customRole)).toBe(true);
    });

    it('should deny updating ADMIN role even for admins', () => {
      expect(policy.canUpdate(adminUser, adminRole)).toBe(false);
    });

    it('should deny regular users', () => {
      expect(policy.canUpdate(regularUser, customRole)).toBe(false);
    });
  });

  describe('canDelete', () => {
    it('should allow ADMIN to delete custom roles', () => {
      expect(policy.canDelete(adminUser, customRole)).toBe(true);
    });

    it('should deny deleting system roles (ADMIN, USER, GUEST)', () => {
      expect(policy.canDelete(adminUser, adminRole)).toBe(false);

      const userRole = { ...customRole, name: 'USER' };
      expect(policy.canDelete(adminUser, userRole)).toBe(false);

      const guestRole = { ...customRole, name: 'GUEST' };
      expect(policy.canDelete(adminUser, guestRole)).toBe(false);
    });

    it('should deny regular users', () => {
      expect(policy.canDelete(regularUser, customRole)).toBe(false);
    });
  });

  describe('canAssign', () => {
    it('should allow ADMIN to assign ADMIN role', () => {
      expect(policy.canAssign(adminUser, adminRole)).toBe(true);
    });

    it('should allow users with ROLE:ASSIGN to assign non-ADMIN roles', () => {
      expect(policy.canAssign(managerUser, customRole)).toBe(true);
    });

    it('should deny non-ADMIN from assigning ADMIN role', () => {
      expect(policy.canAssign(managerUser, adminRole)).toBe(false);
    });

    it('should deny regular users', () => {
      expect(policy.canAssign(regularUser, customRole)).toBe(false);
    });
  });

  describe('ensureCanUpdate', () => {
    it('should throw specific error for ADMIN role', () => {
      expect(() => policy.ensureCanUpdate(adminUser, adminRole)).toThrow('ADMIN 역할은 수정할 수 없습니다');
    });

    it('should not throw for custom roles with permission', () => {
      expect(() => policy.ensureCanUpdate(adminUser, customRole)).not.toThrow();
    });
  });

  describe('ensureCanDelete', () => {
    it('should throw specific error for system roles', () => {
      expect(() => policy.ensureCanDelete(adminUser, adminRole)).toThrow('시스템 역할은 삭제할 수 없습니다');
    });

    it('should not throw for custom roles with permission', () => {
      expect(() => policy.ensureCanDelete(adminUser, customRole)).not.toThrow();
    });
  });

  describe('ensureCanAssign', () => {
    it('should throw specific error when non-admin tries to assign ADMIN role', () => {
      expect(() => policy.ensureCanAssign(managerUser, adminRole)).toThrow('ADMIN 역할 할당은 ADMIN만 가능합니다');
    });

    it('should not throw for authorized assignments', () => {
      expect(() => policy.ensureCanAssign(adminUser, adminRole)).not.toThrow();
      expect(() => policy.ensureCanAssign(managerUser, customRole)).not.toThrow();
    });
  });
});
