import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  canAssignRole,
  canCreateRole,
  canDeleteRole,
  canReadRole,
  canUpdateRole,
  ensureCanAssignRole,
  ensureCanDeleteRole,
  ensureCanUpdateRole,
  ensureRoleNameAllowed,
} from '@/lib/policies';
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

    it('기본 역할 5개는 ADMIN 도 삭제할 수 없다(헌법 §1.4)', () => {
      for (const name of ['ADMIN', 'MANAGER', 'ENGINEER', 'CLIENT_ADMIN', 'CLIENT_USER']) {
        expect(canDeleteRole(adminUser, { ...customRole, name }), name).toBe(false);
      }
    });

    it('예전 보호 목록의 USER·GUEST 는 이 시스템에 없는 이름이라 보호 대상이 아니다', () => {
      expect(canDeleteRole(adminUser, { ...customRole, name: 'USER' })).toBe(true);
      expect(canDeleteRole(adminUser, { ...customRole, name: 'GUEST' })).toBe(true);
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
      expect(() => ensureCanUpdateRole(adminUser, adminRole)).toThrow(
        'ADMIN 역할은 수정할 수 없습니다'
      );
    });

    it('should not throw for custom roles with permission', () => {
      expect(() => ensureCanUpdateRole(adminUser, customRole)).not.toThrow();
    });
  });

  describe('ensureCanDeleteRole', () => {
    it('should throw specific error for canonical roles', () => {
      expect(() => ensureCanDeleteRole(adminUser, adminRole)).toThrow(
        '기본 역할은 삭제할 수 없습니다'
      );
      expect(() => ensureCanDeleteRole(adminUser, { ...customRole, name: 'MANAGER' })).toThrow(
        '기본 역할은 삭제할 수 없습니다'
      );
    });

    it('should not throw for custom roles with permission', () => {
      expect(() => ensureCanDeleteRole(adminUser, customRole)).not.toThrow();
    });
  });

  describe('ensureCanAssignRole', () => {
    it('should throw specific error when non-admin tries to assign ADMIN role', () => {
      expect(() => ensureCanAssignRole(managerUser, adminRole)).toThrow(
        'ADMIN 역할 할당은 ADMIN만 가능합니다'
      );
    });

    it('should not throw for authorized assignments', () => {
      expect(() => ensureCanAssignRole(adminUser, adminRole)).not.toThrow();
      expect(() => ensureCanAssignRole(managerUser, customRole)).not.toThrow();
    });
  });
  describe('ensureRoleNameAllowed — 기본 역할 이름 보호(헌법 §1.4)', () => {
    it('이름을 보내지 않거나 지금 이름 그대로면 통과한다', () => {
      expect(() => ensureRoleNameAllowed(undefined, { name: 'MANAGER' })).not.toThrow();
      expect(() => ensureRoleNameAllowed('MANAGER', { name: 'MANAGER' })).not.toThrow();
    });

    it('기본 역할의 이름은 바꿀 수 없다', () => {
      expect(() => ensureRoleNameAllowed('OPS', { name: 'CLIENT_ADMIN' })).toThrow(
        '기본 역할(CLIENT_ADMIN)의 이름은 바꿀 수 없습니다.'
      );
    });

    it('새 이름이 기본 역할 이름이면 대소문자·공백과 무관하게 막는다', () => {
      expect(() => ensureRoleNameAllowed('manager')).toThrow(
        '기본 역할 이름(manager)은 쓸 수 없습니다.'
      );
      expect(() => ensureRoleNameAllowed(' Client_User ', { name: 'SUPPORT' })).toThrow(
        /기본 역할 이름/
      );
    });

    it('평범한 이름은 통과한다', () => {
      expect(() => ensureRoleNameAllowed('AUDITOR')).not.toThrow();
      expect(() => ensureRoleNameAllowed('SUPPORT_LEAD', { name: 'SUPPORT' })).not.toThrow();
    });
  });
});
