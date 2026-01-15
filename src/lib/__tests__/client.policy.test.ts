import { describe, it, expect } from 'vitest';
import {
  canCreateClient,
  canReadClient,
  canUpdateClient,
  canDeleteClient,
  ensureCanCreateClient,
  ensureCanReadClient,
} from '@/lib/policies';
import { Client } from '@prisma/client';
import { AuthenticatedUser } from '@/types/session';

describe('Client Policy Functions', () => {
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
    permissions: ['CLIENT:READ', 'CLIENT:CREATE', 'CLIENT:UPDATE'],
    clientIds: [],
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
    industry: null,
    contactPerson: null,
    contactEmail: null,
    contactPhone: null,
    address: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    contractStartDate: null,
    contractEndDate: null,
  };

  describe('canCreateClient', () => {
    it('should allow ADMIN to create clients', () => {
      expect(canCreateClient(adminUser)).toBe(true);
    });

    it('should allow users with CLIENT:CREATE permission', () => {
      expect(canCreateClient(managerUser)).toBe(true);
    });

    it('should deny regular users without permission', () => {
      expect(canCreateClient(regularUser)).toBe(false);
    });
  });

  describe('canReadClient', () => {
    it('should allow ADMIN to read all clients', () => {
      expect(canReadClient(adminUser)).toBe(true);
      expect(canReadClient(adminUser, mockClient)).toBe(true);
    });

    it('should allow users with CLIENT:READ permission', () => {
      expect(canReadClient(managerUser)).toBe(true);
      expect(canReadClient(managerUser, mockClient)).toBe(true);
    });

    it('should allow users to read their own client', () => {
      expect(canReadClient(regularUser, mockClient)).toBe(true);
    });

    it('should deny users from reading other clients', () => {
      const otherClient = { ...mockClient, id: 'client-2' };
      expect(canReadClient(regularUser, otherClient)).toBe(false);
    });

    it('should deny regular users from reading all clients', () => {
      expect(canReadClient(regularUser)).toBe(false);
    });
  });

  describe('canUpdateClient', () => {
    it('should allow ADMIN to update clients', () => {
      expect(canUpdateClient(adminUser)).toBe(true);
    });

    it('should allow users with CLIENT:UPDATE permission', () => {
      expect(canUpdateClient(managerUser)).toBe(true);
    });

    it('should deny regular users', () => {
      expect(canUpdateClient(regularUser)).toBe(false);
    });
  });

  describe('canDeleteClient', () => {
    it('should allow ADMIN to delete clients', () => {
      expect(canDeleteClient(adminUser)).toBe(true);
    });

    it('should deny users without CLIENT:DELETE permission', () => {
      expect(canDeleteClient(managerUser)).toBe(false);
      expect(canDeleteClient(regularUser)).toBe(false);
    });
  });

  describe('ensureCanCreateClient', () => {
    it('should not throw for authorized users', () => {
      expect(() => ensureCanCreateClient(adminUser)).not.toThrow();
    });

    it('should throw ForbiddenError for unauthorized users', () => {
      expect(() => ensureCanCreateClient(regularUser)).toThrow('고객사 생성 권한이 없습니다');
    });
  });

  describe('ensureCanReadClient', () => {
    it('should not throw for authorized users', () => {
      expect(() => ensureCanReadClient(adminUser, mockClient)).not.toThrow();
      expect(() => ensureCanReadClient(regularUser, mockClient)).not.toThrow();
    });

    it('should throw ForbiddenError for unauthorized users', () => {
      const otherClient = { ...mockClient, id: 'client-2' };
      expect(() => ensureCanReadClient(regularUser, otherClient)).toThrow('고객사 조회 권한이 없습니다');
    });
  });
});
