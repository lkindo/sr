import { User } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  canCreateUser,
  canDeleteUser,
  canReadUser,
  canUpdateUser,
  ensureCanDeleteUser,
} from '@/lib/policies';
import { AuthenticatedUser } from '@/types/session';

describe('User Policy Functions', () => {
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
    permissions: ['USER:READ', 'USER:UPDATE'],
    clientIds: [],
  };

  const regularUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Regular User',
    image: null,
    roles: ['USER'],
    permissions: ['USER:UPDATE_SELF'],
    clientIds: [],
  };

  const mockUser: User = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: null,
    image: null,
    password: 'hashed',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('canCreateUser', () => {
    it('should allow ADMIN to create users', () => {
      expect(canCreateUser(adminUser)).toBe(true);
    });

    it('should deny regular users', () => {
      expect(canCreateUser(regularUser)).toBe(false);
    });
  });

  describe('canReadUser', () => {
    it('should allow ADMIN to read all users', () => {
      expect(canReadUser(adminUser)).toBe(true);
      expect(canReadUser(adminUser, mockUser)).toBe(true);
    });

    it('should allow users with USER:READ permission', () => {
      expect(canReadUser(managerUser)).toBe(true);
      expect(canReadUser(managerUser, mockUser)).toBe(true);
    });

    it('should allow users to read themselves', () => {
      expect(canReadUser(regularUser, mockUser)).toBe(true);
    });

    it('should deny users from reading others', () => {
      const otherUser = { ...mockUser, id: 'other-user' };
      expect(canReadUser(regularUser, otherUser)).toBe(false);
    });
  });

  describe('canUpdateUser', () => {
    it('should allow ADMIN to update any user', () => {
      expect(canUpdateUser(adminUser, mockUser)).toBe(true);
    });

    it('should allow users with USER:UPDATE permission', () => {
      expect(canUpdateUser(managerUser, mockUser)).toBe(true);
    });

    it('should allow users to update themselves with UPDATE_SELF permission', () => {
      expect(canUpdateUser(regularUser, mockUser)).toBe(true);
    });

    it('should deny users from updating others without permission', () => {
      const otherUser = { ...mockUser, id: 'other-user' };
      expect(canUpdateUser(regularUser, otherUser)).toBe(false);
    });
  });

  describe('canDeleteUser', () => {
    it('should allow ADMIN to delete other users', () => {
      const otherUser = { ...mockUser, id: 'other-user' };
      expect(canDeleteUser(adminUser, otherUser)).toBe(true);
    });

    it('should deny users from deleting themselves', () => {
      const adminSelf = { ...mockUser, id: 'admin-1' };
      expect(canDeleteUser(adminUser, adminSelf)).toBe(false);
    });

    it('should deny regular users from deleting anyone', () => {
      expect(canDeleteUser(regularUser, mockUser)).toBe(false);
    });
  });

  describe('ensureCanDeleteUser', () => {
    it('should throw specific error when trying to delete self', () => {
      const adminSelf = { ...mockUser, id: 'admin-1' };
      expect(() => ensureCanDeleteUser(adminUser, adminSelf)).toThrow(
        '자기 자신을 삭제할 수 없습니다'
      );
    });

    it('should throw error when trying to delete self (takes precedence)', () => {
      expect(() => ensureCanDeleteUser(regularUser, mockUser)).toThrow(
        '자기 자신을 삭제할 수 없습니다'
      );
    });

    it('should throw permission error when deleting others without permission', () => {
      const otherUser = { ...mockUser, id: 'other-user' };
      expect(() => ensureCanDeleteUser(regularUser, otherUser)).toThrow(
        '사용자 삭제 권한이 없습니다'
      );
    });
  });
});
