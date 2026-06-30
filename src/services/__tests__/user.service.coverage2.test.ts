import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { UserService } from '@/services/user.service';

// Mock dependencies

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed'),
  compare: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    role: { findFirst: vi.fn() },
    rolePermission: { findMany: vi.fn() },
    userRole: { createMany: vi.fn() },
    userClient: { createMany: vi.fn(), deleteMany: vi.fn() },
    sR: { findMany: vi.fn(), count: vi.fn() },
    sRActivity: { count: vi.fn() },
    sRComment: { count: vi.fn() },
    sRStatusHistory: { count: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

describe('UserService - coverage2 (uncovered methods)', () => {
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    userService = new UserService();
    // Reset $transaction to default delegate behaviour after clearAllMocks.
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(prisma));
  });

  describe('getUserById', () => {
    it('returns null when user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await userService.getUserById('missing');
      expect(result).toBeNull();
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('merges role permissions and strips password (with roles)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        email: 'u1@test.com',
        password: 'secret',
        roles: [
          {
            roleId: 'r1',
            role: { id: 'r1', name: 'ADMIN', description: null },
          },
        ],
        clients: [],
      } as any);
      vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([
        { id: 'rp1', roleId: 'r1', permission: { id: 'p1', name: 'SR:READ' } },
      ] as any);

      const result: any = await userService.getUserById('u1');

      expect(result.password).toBeUndefined();
      expect(prisma.rolePermission.findMany).toHaveBeenCalledWith({
        where: { roleId: { in: ['r1'] } },
        include: { permission: true },
      });
      expect(result.roles[0].role.permissions).toHaveLength(1);
      expect(result.roles[0].role.permissions[0].permission.name).toBe('SR:READ');
    });

    it('handles a user-role entry with no role object (fallback role)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u2',
        email: 'u2@test.com',
        password: 'secret',
        roles: [{ roleId: 'rX', role: null }],
        clients: [],
      } as any);
      vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([]);

      const result: any = await userService.getUserById('u2');
      expect(result.roles[0].role.id).toBe('');
      expect(result.roles[0].role.permissions).toEqual([]);
    });
  });

  describe('getUserByEmail', () => {
    it('returns null when not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      const result = await userService.getUserByEmail('none@test.com');
      expect(result).toBeNull();
    });

    it('returns user without password', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        email: 'u1@test.com',
        password: 'secret',
        roles: [],
        clients: [],
      } as any);

      const result: any = await userService.getUserByEmail('u1@test.com');
      expect(result.password).toBeUndefined();
      expect(result.email).toBe('u1@test.com');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'u1@test.com' } })
      );
    });
  });

  describe('getUserByClientId', () => {
    it('returns users scoped to client without passwords', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'u1', password: 's1', roles: [], clients: [] },
        { id: 'u2', password: 's2', roles: [], clients: [] },
      ] as any);

      const result = await userService.getUserByClientId('client-1');
      expect(result).toHaveLength(2);
      expect((result[0] as any).password).toBeUndefined();
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clients: { some: { clientId: 'client-1' } } },
        })
      );
    });
  });

  describe('getAllUsers filter branches', () => {
    beforeEach(() => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);
    });

    it('applies isActive, roleId and userType=CLIENT filters', async () => {
      await userService.getAllUsers(
        { isActive: 'true', roleId: 'r1', userType: 'CLIENT' },
        { skip: 0, take: 10 }
      );

      const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any;
      expect(call.where.isActive).toBe(true);
      expect(call.where.roles).toEqual({ some: { roleId: 'r1' } });
      expect(call.where.AND).toEqual([{ clients: { some: {} } }]);
    });

    it('applies roleId=none, clientId=unassigned and userType=ENGINEER filters', async () => {
      await userService.getAllUsers({
        isActive: 'false',
        roleId: 'none',
        clientId: 'unassigned',
        userType: 'ENGINEER',
      });

      const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any;
      expect(call.where.isActive).toBe(false);
      expect(call.where.roles).toEqual({ none: {} });
      expect(call.where.clients).toEqual({ none: {} });
      expect(call.where.AND).toEqual([{ clients: { none: {} } }]);
    });

    it('applies role name list filter and object clientId filter', async () => {
      await userService.getAllUsers({
        role: 'ADMIN,MANAGER',
        clientId: { in: ['c1', 'c2'] },
      });

      const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any;
      expect(call.where.roles).toEqual({ some: { role: { name: { in: ['ADMIN', 'MANAGER'] } } } });
      expect(call.where.clients).toEqual({ some: { clientId: { in: ['c1', 'c2'] } } });
    });

    it('applies plain string clientId filter and computes userType from clients', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'u1', clients: [{ client: { id: 'c1' } }] },
        { id: 'u2', clients: [] },
      ] as any);
      vi.mocked(prisma.user.count).mockResolvedValue(2);

      const result = await userService.getAllUsers({ clientId: 'c1' });

      const call = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any;
      expect(call.where.clients).toEqual({ some: { clientId: 'c1' } });
      expect(result.total).toBe(2);
      expect((result.data[0] as any).userType).toBe('CLIENT');
      expect((result.data[1] as any).userType).toBe('ENGINEER');
    });
  });

  describe('updateUser', () => {
    it('throws NotFoundError when user does not exist (non-test bypass)', async () => {
      // findUnique here is a vi.fn() (mock), but to hit the NotFoundError path we need
      // the test-env bypass disabled. Temporarily clear the env flags.
      const prevVitest = process.env.VITEST;
      const prevNodeEnv = process.env.NODE_ENV;
      process.env.VITEST = 'false';
      (process.env as any).NODE_ENV = 'development';
      try {
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
        await expect(userService.updateUser('missing', { name: 'X' })).rejects.toThrow(
          NotFoundError
        );
      } finally {
        process.env.VITEST = prevVitest;
        (process.env as any).NODE_ENV = prevNodeEnv;
      }
    });

    it('updates user fields and returns user without password', async () => {
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({
          id: 'u1',
          email: 'u1@test.com',
          password: 'secret',
          roles: [],
          clients: [],
        } as any) // beforeUser
        .mockResolvedValueOnce({
          id: 'u1',
          email: 'u1@test.com',
          password: 'secret',
          roles: [],
          clients: [],
        } as any); // afterUser
      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'u1',
        email: 'u1@test.com',
        password: 'secret',
      } as any);

      const result: any = await userService.updateUser('u1', { name: 'New Name' }, 'actor-1');
      expect(result.password).toBeUndefined();
      expect(result.id).toBe('u1');
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('throws BusinessRuleError when assigning clients to a system-team user', async () => {
      // beforeUser exists
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({
          id: 'u1',
          email: 'u1@test.com',
          password: 'secret',
          roles: [],
          clients: [],
        } as any)
        // userRoles check inside transaction -> system team member
        .mockResolvedValueOnce({
          roles: [{ role: { name: 'ENGINEER' } }],
        } as any);
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1' } as any);

      await expect(userService.updateUser('u1', { name: 'X', clientIds: ['c1'] })).rejects.toThrow(
        BusinessRuleError
      );
    });
  });

  describe('updatePassword', () => {
    it('updates password and returns user without password', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'u1',
        password: 'newhash',
      } as any);

      const result: any = await userService.updatePassword('u1', 'newhash', 'actor-1');
      expect(result.password).toBeUndefined();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { password: 'newhash' },
      });
    });
  });

  describe('updateProfile', () => {
    it('updates profile data and strips password', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'u1',
        name: 'Updated',
        password: 'secret',
      } as any);

      const result: any = await userService.updateProfile('u1', { name: 'Updated' });
      expect(result.password).toBeUndefined();
      expect(result.name).toBe('Updated');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { name: 'Updated' },
      });
    });
  });

  describe('activateUser', () => {
    it('activates user and returns user without password', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({
        id: 'u1',
        isActive: true,
        password: 'secret',
      } as any);

      const result: any = await userService.activateUser('u1', 'actor-1', '1.2.3.4');
      expect(result.password).toBeUndefined();
      expect(result.isActive).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isActive: true },
      });
    });
  });

  describe('getUsersWithSRHandlingPermission', () => {
    it('delegates to permissionService.getUsersWithPermissions with SR handling permissions', async () => {
      const fakePermissionService = {
        getUsersWithPermissions: vi
          .fn()
          .mockResolvedValue([{ id: 'u1', name: 'Eng', email: 'e@test.com' }]),
      } as any;

      const result = await userService.getUsersWithSRHandlingPermission(fakePermissionService);

      expect(result).toEqual([{ id: 'u1', name: 'Eng', email: 'e@test.com' }]);
      expect(fakePermissionService.getUsersWithPermissions).toHaveBeenCalledTimes(1);
      const passedPerms = fakePermissionService.getUsersWithPermissions.mock.calls[0][0];
      expect(passedPerms).toContain('SR:CREATE');
      expect(passedPerms).toContain('SR:ASSIGN');
      expect(passedPerms).toContain('COMMENT:CREATE');
    });
  });

  describe('hardDeleteUser - NotFoundError path', () => {
    it('throws NotFoundError when user not found (test bypass disabled)', async () => {
      const prevVitest = process.env.VITEST;
      const prevNodeEnv = process.env.NODE_ENV;
      process.env.VITEST = 'false';
      (process.env as any).NODE_ENV = 'development';
      try {
        vi.mocked(prisma.sR.count).mockResolvedValue(0);
        vi.mocked(prisma.sRActivity.count).mockResolvedValue(0);
        vi.mocked(prisma.sRComment.count).mockResolvedValue(0);
        vi.mocked(prisma.sRStatusHistory.count).mockResolvedValue(0);
        vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

        await expect(userService.hardDeleteUser('missing')).rejects.toThrow(NotFoundError);
      } finally {
        process.env.VITEST = prevVitest;
        (process.env as any).NODE_ENV = prevNodeEnv;
      }
    });
  });
});
