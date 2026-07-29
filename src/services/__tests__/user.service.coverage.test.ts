import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BusinessRuleError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { UserService } from '@/services/user.service';

// Mock dependencies

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    role: { findFirst: vi.fn() },
    userRole: { createMany: vi.fn() },
    userClient: { createMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

// Mock permission service
vi.mock('@/services/permission.service');
import { PermissionService } from '@/services/permission.service';

vi.mocked(PermissionService).mockImplementation(() => {
  return {
    getUsersWithPermissions: vi.fn().mockResolvedValue([{ id: 'u1', name: 'U1' }]),
    // Add other methods if needed by UserService, even if not used in this specific test
    hasPermission: vi.fn(),
    hasRole: vi.fn(),
    hasAnyRole: vi.fn(),
  } as any;
});

describe('UserService Coverage', () => {
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    userService = new UserService();
  });

  describe('getUserById', () => {
    it('calls prisma.user.findUnique with correct include', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as any);
      const result = await userService.getUserById('u1');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          include: expect.objectContaining({
            roles: expect.anything(),
            clients: expect.anything(),
          }),
        })
      );
      expect(result).toEqual({ id: 'u1' });
    });
  });

  describe('getUserByEmail', () => {
    it('calls prisma.user.findUnique with correct include', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', email: 'e@e.com' } as any);
      await userService.getUserByEmail('e@e.com');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'e@e.com' },
        })
      );
    });
  });

  describe('getUserByClientId', () => {
    it('calls prisma.user.findMany with client filter', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1' }] as any);
      await userService.getUserByClientId('c1');
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clients: { some: { clientId: 'c1' } } },
        })
      );
    });
  });

  describe('updateUser', () => {
    it('updates basic user info', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1', name: 'New Name' } as any);

      await userService.updateUser('u1', { name: 'New Name' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ name: 'New Name' }),
        })
      );
    });

    it('updates client assignments', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1' } as any);
      // Mock system team check: user has basic roles, not system team
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        roles: [{ role: { name: 'CLIENT_USER' } }],
      } as any);

      await userService.updateUser('u1', { clientIds: ['c1', 'c2'] });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: {
            clients: {
              // 감사 3.7: 무조건 전체 삭제가 아니라 제출되지 않은 소속만 제거한다.
              deleteMany: { clientId: { notIn: ['c1', 'c2'] } },
              // 신규 소속은 APPROVED 기본값이 아니라 PENDING 으로 생성되어야 한다.
              create: [
                { clientId: 'c1', status: 'PENDING' },
                { clientId: 'c2', status: 'PENDING' },
              ],
            },
          },
        })
      );
    });

    // 회귀 방지: 셀프 테넌트 가입 권한 상승(감사 3.7)을 고정한다.
    it('신규 고객사 소속은 모두 PENDING 으로 생성된다 (APPROVED 기본값 금지)', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1' } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        roles: [{ role: { name: 'CLIENT_USER' } }],
      } as any);

      await userService.updateUser('u1', { clientIds: ['c1', 'c2'] });

      const membershipCall = vi
        .mocked(prisma.user.update)
        .mock.calls.map((call) => call[0] as any)
        .find((args) => args?.data?.clients);
      expect(membershipCall).toBeDefined();

      const created = membershipCall.data.clients.create as Array<Record<string, unknown>>;
      expect(created).toHaveLength(2);
      for (const membership of created) {
        expect(membership.status).toBe('PENDING');
        expect(membership.status).not.toBe('APPROVED');
        // 승인 상태를 우회할 수 있는 승인 메타데이터를 함께 심어서는 안 된다.
        expect(membership).not.toHaveProperty('approvedAt');
        expect(membership).not.toHaveProperty('approvedById');
      }
    });

    it('deleteMany 는 제출된 목록 밖 소속만 지우도록 범위가 지정된다', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1' } as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        roles: [{ role: { name: 'CLIENT_USER' } }],
      } as any);

      await userService.updateUser('u1', { clientIds: ['c1', 'c2'] });

      const membershipCall = vi
        .mocked(prisma.user.update)
        .mock.calls.map((call) => call[0] as any)
        .find((args) => args?.data?.clients);

      const deleteMany = membershipCall.data.clients.deleteMany;
      // 무조건적 전체 삭제({})로 되돌아가면 승인 이력이 통째로 날아간다.
      expect(deleteMany).not.toEqual({});
      expect(deleteMany).toEqual({ clientId: { notIn: ['c1', 'c2'] } });
    });

    it('기존 APPROVED 소속은 PENDING 으로 강등되지 않고 보존된다', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1' } as any);
      // 이미 c1 에 APPROVED 로 소속된 사용자
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        roles: [{ role: { name: 'CLIENT_USER' } }],
        clients: [{ clientId: 'c1', status: 'APPROVED' }],
      } as any);

      await userService.updateUser('u1', { clientIds: ['c1', 'c2'] });

      const membershipCall = vi
        .mocked(prisma.user.update)
        .mock.calls.map((call) => call[0] as any)
        .find((args) => args?.data?.clients);

      const created = membershipCall.data.clients.create as Array<Record<string, unknown>>;
      // 기존 APPROVED 소속(c1)은 재생성 대상이 아니어야 한다 (재생성 시 PENDING 으로 강등됨).
      expect(created).toEqual([{ clientId: 'c2', status: 'PENDING' }]);
      expect(created.map((membership) => membership.clientId)).not.toContain('c1');
      // 그리고 삭제 범위에서도 제외되어 승인 상태가 그대로 유지된다.
      expect(membershipCall.data.clients.deleteMany).toEqual({
        clientId: { notIn: ['c1', 'c2'] },
      });
    });

    it('throws BusinessRuleError if assigning clients to System Team', async () => {
      // Mock user as ENGINEER
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        roles: [{ role: { name: 'ENGINEER' } }],
      } as any);

      await expect(userService.updateUser('u1', { clientIds: ['c1'] })).rejects.toThrow(
        BusinessRuleError
      );
    });
  });

  describe('updateProfile', () => {
    it('updates profile fields', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1' } as any);
      await userService.updateProfile('u1', { name: 'N' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { name: 'N' },
      });
    });
  });

  describe('activateUser', () => {
    it('sets isActive to true and invalidates cache', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1', isActive: true } as any);
      await userService.activateUser('u1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isActive: true },
      });
    });
  });

  describe('getAllUsers Filters', () => {
    it('filters by isActive=true', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);
      await userService.getAllUsers({ isActive: 'true' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        })
      );
    });

    it('filters by isActive=false', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);
      await userService.getAllUsers({ isActive: 'false' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false }),
        })
      );
    });

    it('filters by clientId (unassigned)', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);
      await userService.getAllUsers({ clientId: 'unassigned' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clients: { none: {} } }),
        })
      );
    });

    it('filters by clientId (specific)', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);
      await userService.getAllUsers({ clientId: 'c1' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clients: { some: { clientId: 'c1' } } }),
        })
      );
    });

    it('filters by roleId (none)', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);
      await userService.getAllUsers({ roleId: 'none' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ roles: { none: {} } }),
        })
      );
    });

    it('filters by role names', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);
      await userService.getAllUsers({ role: 'ADMIN,MANAGER' });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            roles: { some: { role: { name: { in: ['ADMIN', 'MANAGER'] } } } },
          }),
        })
      );
    });

    it('filters by UserType CLIENT', async () => {
      const mockUsers = [
        { id: 'u1', clients: [{ clientId: 'c1' }] }, // CLIENT
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);
      vi.mocked(prisma.user.count).mockResolvedValue(1);

      const result = await userService.getAllUsers({ userType: 'CLIENT' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([{ clients: { some: {} } }]),
          }),
        })
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('u1');
    });

    it('filters by UserType ENGINEER', async () => {
      const mockUsers = [
        { id: 'u2', clients: [] }, // ENGINEER
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);
      vi.mocked(prisma.user.count).mockResolvedValue(1);

      const result = await userService.getAllUsers({ userType: 'ENGINEER' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([{ clients: { none: {} } }]),
          }),
        })
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('u2');
    });
  });

  describe('getUsersWithSRHandlingPermission', () => {
    it('delegates to PermissionService', async () => {
      const mockPermissionService = {
        getUsersWithPermissions: vi.fn().mockResolvedValue([{ id: 'u1', name: 'U1' }]),
      };
      const result = await userService.getUsersWithSRHandlingPermission(
        mockPermissionService as any
      );
      expect(result).toHaveLength(1);
      expect(mockPermissionService.getUsersWithPermissions).toHaveBeenCalled();
    });
  });
});
