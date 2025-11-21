import { describe, it, expect } from 'vitest';
import { ClientPolicy } from '../client.policy';
import { Client } from '@prisma/client';
import { AuthenticatedUser } from '@/types/session';

describe('ClientPolicy', () => {
  const policy = new ClientPolicy();

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
    permissions: ['CLIENT:READ', 'CLIENT:CREATE', 'CLIENT:UPDATE'],
  };

  const regularUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Regular User',
    image: null,
    roles: ['USER'],
    permissions: [],
    clientIds: ['client-1'],
  };

  const mockClient: Client = {
    id: 'client-1',
    name: 'Test Client',
    code: 'TC001',
    description: null,
    industry: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    address: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('canCreate', () => {
    it('should allow ADMIN to create clients', () => {
      expect(policy.canCreate(adminUser)).toBe(true);
    });

    it('should allow users with CLIENT:CREATE permission', () => {
      expect(policy.canCreate(managerUser)).toBe(true);
    });

    it('should deny regular users without permission', () => {
      expect(policy.canCreate(regularUser)).toBe(false);
    });
  });

  describe('canRead', () => {
    it('should allow ADMIN to read all clients', () => {
      expect(policy.canRead(adminUser)).toBe(true);
      expect(policy.canRead(adminUser, mockClient)).toBe(true);
    });

    it('should allow users with CLIENT:READ permission', () => {
      expect(policy.canRead(managerUser)).toBe(true);
      expect(policy.canRead(managerUser, mockClient)).toBe(true);
    });

    it('should allow users to read their own client', () => {
      expect(policy.canRead(regularUser, mockClient)).toBe(true);
    });

    it('should deny users from reading other clients', () => {
      const otherClient = { ...mockClient, id: 'client-2' };
      expect(policy.canRead(regularUser, otherClient)).toBe(false);
    });

    it('should deny regular users from reading all clients', () => {
      expect(policy.canRead(regularUser)).toBe(false);
    });
  });

  describe('canUpdate', () => {
    it('should allow ADMIN to update clients', () => {
      expect(policy.canUpdate(adminUser, mockClient)).toBe(true);
    });

    it('should allow users with CLIENT:UPDATE permission', () => {
      expect(policy.canUpdate(managerUser, mockClient)).toBe(true);
    });

    it('should deny regular users', () => {
      expect(policy.canUpdate(regularUser, mockClient)).toBe(false);
    });
  });

  describe('canDelete', () => {
    it('should allow ADMIN to delete clients', () => {
      expect(policy.canDelete(adminUser)).toBe(true);
    });

    it('should deny users without CLIENT:DELETE permission', () => {
      expect(policy.canDelete(managerUser)).toBe(false);
      expect(policy.canDelete(regularUser)).toBe(false);
    });
  });

  describe('ensureCanCreate', () => {
    it('should not throw for authorized users', () => {
      expect(() => policy.ensureCanCreate(adminUser)).not.toThrow();
    });

    it('should throw ForbiddenError for unauthorized users', () => {
      expect(() => policy.ensureCanCreate(regularUser)).toThrow('고객사 생성 권한이 없습니다');
    });
  });

  describe('ensureCanRead', () => {
    it('should not throw for authorized users', () => {
      expect(() => policy.ensureCanRead(adminUser, mockClient)).not.toThrow();
      expect(() => policy.ensureCanRead(regularUser, mockClient)).not.toThrow();
    });

    it('should throw ForbiddenError for unauthorized users', () => {
      const otherClient = { ...mockClient, id: 'client-2' };
      expect(() => policy.ensureCanRead(regularUser, otherClient)).toThrow('고객사 조회 권한이 없습니다');
    });
  });
});
