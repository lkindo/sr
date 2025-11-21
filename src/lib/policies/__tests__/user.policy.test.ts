import { describe, it, expect } from 'vitest';
import { UserPolicy } from '../user.policy';
import { User } from '@prisma/client';
import { AuthenticatedUser } from '@/types/session';

describe('UserPolicy', () => {
  const policy = new UserPolicy();

  const adminUser: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin User',
    image: null,
    roles: ['ADMIN'],
    permissions: [],
  };

  const managerUser: AuthenticatedUser = {
    id: 'manager-1',
    email: 'manager@example.com',
    name: 'Manager User',
    image: null,
    roles: ['MANAGER'],
    permissions: ['USER:READ', 'USER:UPDATE'],
  };

  const regularUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Regular User',
    image: null,
    roles: ['USER'],
    permissions: ['USER:UPDATE_SELF'],
  };

  const mockUser: User = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: null,
    image: null,
    hashedPassword: 'hashed',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('canCreate', () => {
    it('should allow ADMIN to create users', () => {
      expect(policy.canCreate(adminUser)).toBe(true);
    });

    it('should deny regular users', () => {
      expect(policy.canCreate(regularUser)).toBe(false);
    });
  });

  describe('canRead', () => {
    it('should allow ADMIN to read all users', () => {
      expect(policy.canRead(adminUser)).toBe(true);
      expect(policy.canRead(adminUser, mockUser)).toBe(true);
    });

    it('should allow users with USER:READ permission', () => {
      expect(policy.canRead(managerUser)).toBe(true);
      expect(policy.canRead(managerUser, mockUser)).toBe(true);
    });

    it('should allow users to read themselves', () => {
      expect(policy.canRead(regularUser, mockUser)).toBe(true);
    });

    it('should deny users from reading others', () => {
      const otherUser = { ...mockUser, id: 'other-user' };
      expect(policy.canRead(regularUser, otherUser)).toBe(false);
    });
  });

  describe('canUpdate', () => {
    it('should allow ADMIN to update any user', () => {
      expect(policy.canUpdate(adminUser, mockUser)).toBe(true);
    });

    it('should allow users with USER:UPDATE permission', () => {
      expect(policy.canUpdate(managerUser, mockUser)).toBe(true);
    });

    it('should allow users to update themselves with UPDATE_SELF permission', () => {
      expect(policy.canUpdate(regularUser, mockUser)).toBe(true);
    });

    it('should deny users from updating others without permission', () => {
      const otherUser = { ...mockUser, id: 'other-user' };
      expect(policy.canUpdate(regularUser, otherUser)).toBe(false);
    });
  });

  describe('canDelete', () => {
    it('should allow ADMIN to delete other users', () => {
      const otherUser = { ...mockUser, id: 'other-user' };
      expect(policy.canDelete(adminUser, otherUser)).toBe(true);
    });

    it('should deny users from deleting themselves', () => {
      const adminSelf = { ...mockUser, id: 'admin-1' };
      expect(policy.canDelete(adminUser, adminSelf)).toBe(false);
    });

    it('should deny regular users from deleting anyone', () => {
      expect(policy.canDelete(regularUser, mockUser)).toBe(false);
    });
  });

  describe('ensureCanDelete', () => {
    it('should throw specific error when trying to delete self', () => {
      const adminSelf = { ...mockUser, id: 'admin-1' };
      expect(() => policy.ensureCanDelete(adminUser, adminSelf)).toThrow('자기 자신을 삭제할 수 없습니다');
    });

    it('should throw error when trying to delete self (takes precedence)', () => {
      // User trying to delete themselves - this check comes before permission check
      expect(() => policy.ensureCanDelete(regularUser, mockUser)).toThrow('자기 자신을 삭제할 수 없습니다');
    });

    it('should throw permission error when deleting others without permission', () => {
      const otherUser = { ...mockUser, id: 'other-user' };
      expect(() => policy.ensureCanDelete(regularUser, otherUser)).toThrow('사용자 삭제 권한이 없습니다');
    });
  });
});
