import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BusinessRuleError } from '@/lib/errors';
import { isInternalUser } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SR_HANDLER_INTERNAL_ROLES, UserService } from '@/services/user.service';

// Mock dependencies

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn((cb: any) =>
      typeof cb === 'function' ? cb(prisma) : Promise.all(cb)
    ),
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    role: { findFirst: vi.fn() },
    rolePermission: { findMany: vi.fn() },
    userRole: { createMany: vi.fn() },
    userClient: { createMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

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
      expect(result.data[0]!.id).toBe('u1');
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
      expect(result.data[0]!.id).toBe('u2');
    });
  });

  /**
   * SR 담당자 자격 판정.
   *
   * getUsersWithSRHandlingPermission 은 "내부 역할 + 담당자 필수 권한"을 한 번의 Prisma 쿼리로
   * 평가한다. 따라서 자격 규칙의 실체는 이 쿼리의 where 절이며, 아래 테스트는
   *  (1) where 절이 요구하는 권한/역할 자체를 고정하고,
   *  (2) 시드(prisma/seed.ts)와 동일한 역할·권한 카탈로그에 대해 그 where 절을 Prisma 관계 필터
   *      의미대로 평가해 역할별 자격 매트릭스를 고정한다.
   * (mock 으로 결과를 바꿔치기하지 않고 서비스가 실제로 만든 조건식을 해석한다.)
   */
  describe('getUsersWithSRHandlingPermission', () => {
    /** where.AND 에서 요구 권한 목록("RESOURCE:ACTION")을 추출한다. */
    const requestedPermissions = (where: any): string[] =>
      (where.AND ?? []).map((filter: any) => {
        const permission = filter.roles.some.role.OR[1].permissions.some.permission;
        return `${permission.resource}:${permission.action}`;
      });

    it('담당자 내부 역할 목록은 lib/policies 의 isInternalUser 기준과 일치한다', () => {
      // 두 곳에 있는 "내부 사용자" 정의가 조용히 어긋나면 배정 규칙이 정책과 달라진다.
      for (const role of SR_HANDLER_INTERNAL_ROLES) {
        expect(isInternalUser({ roles: [role] } as any)).toBe(true);
      }
      // 외부(고객사) 역할은 어느 쪽 기준으로도 내부 사용자가 아니다.
      for (const role of ['CLIENT_ADMIN', 'CLIENT_USER', 'USER', 'GUEST']) {
        expect(SR_HANDLER_INTERNAL_ROLES).not.toContain(role);
        expect(isInternalUser({ roles: [role] } as any)).toBe(false);
      }
    });

    it('내부 역할과 담당자 필수 권한을 한 쿼리에서 함께 요구한다', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'u1', name: 'U1', email: 'u1@test.com' },
      ] as any);

      const result = await userService.getUsersWithSRHandlingPermission();
      expect(result).toHaveLength(1);

      const where = (vi.mocked(prisma.user.findMany).mock.calls[0]![0] as any).where;
      expect(where.isActive).toBe(true);
      // 역할 축: 내부 역할만 담당자가 될 수 있다.
      expect(where.roles.some.role.name.in).toEqual(['ADMIN', 'MANAGER', 'ENGINEER']);
      // ADMIN 은 권한이 개별로 시딩되지 않아도 암묵적으로 모두 보유한다.
      expect(where.AND[0].roles.some.role.OR[0]).toEqual({ name: 'ADMIN' });
    });

    it('요구 권한은 담당자가 실제로 필요한 것으로 한정된다 (SR:DELETE/SR:ASSIGN 불필요)', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);
      await userService.getUsersWithSRHandlingPermission();

      const where = (vi.mocked(prisma.user.findMany).mock.calls[0]![0] as any).where;
      const permissions = requestedPermissions(where);

      expect(permissions).toEqual([
        'SR:READ',
        'SR:UPDATE',
        'SR:STATUS_CHANGE',
        'COMMENT:CREATE',
        'COMMENT:READ',
      ]);
      // 배정을 "받는" 사람에게 요구하면 ENGINEER 가 영구히 배제되는 권한들
      expect(permissions).not.toContain('SR:DELETE');
      expect(permissions).not.toContain('SR:ASSIGN');
      expect(permissions).not.toContain('SR:CREATE');
      expect(permissions).not.toContain('COMMENT:UPDATE');
    });

    describe('역할별 자격 매트릭스 (시드 카탈로그로 where 절 평가)', () => {
      // prisma/seed.ts 의 역할별 SR/COMMENT 권한을 그대로 옮긴 것.
      // ADMIN 은 개별 권한이 아니라 전체 권한을 부여받으므로 여기서는 빈 목록으로 두고
      // 서비스의 { name: 'ADMIN' } 분기로 통과해야 한다.
      const ROLE_PERMISSIONS: Record<string, string[]> = {
        ADMIN: [],
        MANAGER: [
          'SR:CREATE',
          'SR:READ',
          'SR:UPDATE',
          'SR:UPDATE_SELF',
          'SR:DELETE',
          'SR:ASSIGN',
          'SR:STATUS_CHANGE',
          'COMMENT:CREATE',
          'COMMENT:READ',
          'COMMENT:UPDATE',
          'COMMENT:DELETE',
        ],
        ENGINEER: [
          'SR:READ',
          'SR:UPDATE',
          'SR:STATUS_CHANGE',
          'COMMENT:CREATE',
          'COMMENT:READ',
          'COMMENT:UPDATE',
          'COMMENT:DELETE',
        ],
        CLIENT_ADMIN: [
          'SR:CREATE',
          'SR:READ',
          'SR:UPDATE',
          'SR:STATUS_CHANGE',
          'COMMENT:CREATE',
          'COMMENT:READ',
          'COMMENT:UPDATE',
          'COMMENT:DELETE',
        ],
        CLIENT_USER: ['SR:CREATE', 'SR:READ', 'SR:UPDATE_SELF', 'COMMENT:CREATE', 'COMMENT:READ'],
      };

      const USERS = [
        { id: 'u-admin', name: 'Admin', email: 'admin@test.com', roleNames: ['ADMIN'] },
        { id: 'u-manager', name: 'Manager', email: 'mgr@test.com', roleNames: ['MANAGER'] },
        { id: 'u-engineer', name: 'Engineer', email: 'eng@test.com', roleNames: ['ENGINEER'] },
        { id: 'u-client-admin', name: 'CA', email: 'ca@test.com', roleNames: ['CLIENT_ADMIN'] },
        { id: 'u-client-user', name: 'CU', email: 'cu@test.com', roleNames: ['CLIENT_USER'] },
      ];

      /** 역할 조건(Prisma RoleWhereInput)이 특정 역할에 대해 성립하는지 평가한다. */
      const roleMatches = (
        roleName: string,
        condition: any,
        catalog: Record<string, string[]>
      ): boolean => {
        if (condition.OR) {
          return condition.OR.some((sub: any) => roleMatches(roleName, sub, catalog));
        }
        if (condition.name?.in) {
          return condition.name.in.includes(roleName);
        }
        if (typeof condition.name === 'string') {
          return condition.name === roleName;
        }
        if (condition.permissions?.some?.permission) {
          const { resource, action } = condition.permissions.some.permission;
          return (catalog[roleName] ?? []).includes(`${resource}:${action}`);
        }
        return false;
      };

      /** where 절을 픽스처 사용자에 대해 평가해 배정 가능한 사용자 ID 목록을 만든다. */
      const assignableIds = async (catalog: Record<string, string[]> = ROLE_PERMISSIONS) => {
        vi.mocked(prisma.user.findMany).mockImplementation((async (args: any) => {
          const where = args.where;
          const roleConditions = [
            ...(where.roles ? [where.roles] : []),
            ...(where.AND ?? []).map((filter: any) => filter.roles),
          ];

          return USERS.filter(
            (user) =>
              (where.isActive === undefined || where.isActive === true) &&
              roleConditions.every((rolesFilter: any) =>
                user.roleNames.some((roleName) =>
                  roleMatches(roleName, rolesFilter.some.role, catalog)
                )
              )
          ).map(({ id, name, email }) => ({ id, name, email }));
        }) as any);

        const handlers = await userService.getUsersWithSRHandlingPermission();
        return handlers.map((handler) => handler.id);
      };

      it('ENGINEER 는 담당자로 배정 가능하다 (제품의 핵심 워크플로)', async () => {
        await expect(assignableIds()).resolves.toContain('u-engineer');
      });

      it('ADMIN 과 MANAGER 도 담당자로 배정 가능하다', async () => {
        const ids = await assignableIds();
        expect(ids).toContain('u-admin');
        expect(ids).toContain('u-manager');
      });

      it('CLIENT_ADMIN 은 담당자가 될 수 없다 (권한만으로는 ENGINEER 와 구분되지 않는다)', async () => {
        await expect(assignableIds()).resolves.not.toContain('u-client-admin');
      });

      it('CLIENT_USER 은 담당자가 될 수 없다', async () => {
        await expect(assignableIds()).resolves.not.toContain('u-client-user');
      });

      it('배정 가능 집합은 내부 역할 3종으로 정확히 한정된다', async () => {
        const ids = await assignableIds();
        expect([...ids].sort()).toEqual(['u-admin', 'u-engineer', 'u-manager']);
      });

      it('권한 축도 살아있다: ENGINEER 에게서 SR:UPDATE 를 회수하면 제외된다', async () => {
        const stripped = {
          ...ROLE_PERMISSIONS,
          ENGINEER: ROLE_PERMISSIONS.ENGINEER!.filter((perm) => perm !== 'SR:UPDATE'),
        };
        const ids = await assignableIds(stripped);
        expect(ids).not.toContain('u-engineer');
        // 다른 내부 역할은 그대로 남아 있어야 한다(양성 대조군).
        expect(ids).toContain('u-manager');
      });
    });
  });
});
