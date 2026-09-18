import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 3.11 회귀 테스트 — 역할을 통한 권한 상승.
 *
 * `ROLE:UPDATE` 를 가진 커스텀 역할은 사실상 풀 어드민이었다. 이유가 셋이었다.
 *
 * 1. **불변식이 REST 라우트에만 있었다.** 서버 액션(`role.actions.ts`)은
 *    `authenticateAndAuthorize` 만 통과하면 서비스로 직행했으므로, "ADMIN 역할 불변"
 *    "시스템 역할 삭제 불가" 가 한쪽 진입점에서만 강제됐다.
 * 2. **자기 역할을 대상으로 삼는 것을 막지 않았다.** 보유자가 자기 역할 id 로 POST 하면
 *    그대로 통과했다.
 * 3. **부여할 권한을 행위자 보유 권한으로 제한하지 않았다.** `GET /api/permissions` 로
 *    전체 id 를 받아 넣으면 즉시 `USER:*` `SR:DELETE` `ROLE:ASSIGN` 을 획득했다.
 *
 * 그래서 가드를 서비스 계층(choke point)에 두었다. 이 테스트는 **가드가 막는가**와
 * **정상 운영을 막지 않는가**를 함께 단언한다 — 후자가 없으면 과잉 차단을 놓친다.
 */

const mocks = vi.hoisted(() => ({
  roleFindUnique: vi.fn(),
  roleCreate: vi.fn(),
  roleUpdate: vi.fn(),
  roleDelete: vi.fn(),
  permissionFindMany: vi.fn(),
  rolePermissionFindMany: vi.fn(),
  rolePermissionDeleteMany: vi.fn(),
  rolePermissionCreateMany: vi.fn(),
  userRoleCount: vi.fn(),
  rolePermissionCount: vi.fn(),
  transaction: vi.fn(),
  createLog: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    role: {
      findUnique: mocks.roleFindUnique,
      update: mocks.roleUpdate,
      delete: mocks.roleDelete,
      findMany: vi.fn(),
    },
    permission: { findMany: mocks.permissionFindMany },
    rolePermission: {
      findMany: mocks.rolePermissionFindMany,
      deleteMany: mocks.rolePermissionDeleteMany,
      createMany: mocks.rolePermissionCreateMany,
      count: mocks.rolePermissionCount,
    },
    userRole: { count: mocks.userRoleCount },
    $transaction: mocks.transaction,
  },
}));

vi.mock('../audit.service', () => ({
  auditService: { createLog: mocks.createLog },
}));

import { RoleService } from '../role.service';

const service = new RoleService();

/** ROLE:UPDATE 만 가진 커스텀 역할 보유자 — 이 제품이 만들라고 존재하는 역할이다. */
const roleManager = {
  id: 'u-1',
  email: 'rm@example.com',
  name: '역할 관리자',
  image: null,
  roles: ['ROLE_MANAGER'],
  permissions: ['ROLE:READ', 'ROLE:UPDATE', 'ROLE:DELETE'],
  clientIds: [],
};

const admin = { ...roleManager, id: 'u-admin', roles: ['ADMIN'], permissions: [] };

const otherRole = { id: 'r-2', name: 'SUPPORT', description: null };

beforeEach(() => {
  vi.clearAllMocks();
  const tx = {
    role: { create: mocks.roleCreate, update: mocks.roleUpdate, delete: mocks.roleDelete },
    rolePermission: {
      deleteMany: mocks.rolePermissionDeleteMany,
      createMany: mocks.rolePermissionCreateMany,
    },
  };
  mocks.transaction.mockImplementation(async (cb: never) =>
    typeof cb === 'function' ? (cb as (client: unknown) => unknown)(tx) : undefined
  );
  mocks.roleUpdate.mockImplementation(async ({ data }: { data: unknown }) => ({
    ...otherRole,
    ...(data as object),
  }));
  mocks.roleCreate.mockImplementation(async ({ data }: { data: unknown }) => ({
    id: 'r-new',
    ...(data as object),
  }));
  mocks.roleDelete.mockResolvedValue(otherRole);
  mocks.createLog.mockResolvedValue(undefined);
  mocks.userRoleCount.mockResolvedValue(0);
  mocks.rolePermissionCount.mockResolvedValue(0);
  mocks.rolePermissionFindMany.mockResolvedValue([]);
  mocks.rolePermissionDeleteMany.mockResolvedValue({ count: 0 });
  mocks.rolePermissionCreateMany.mockResolvedValue({ count: 0 });
  mocks.permissionFindMany.mockResolvedValue([]);
});

describe('updateRolePermissions — 권한 상승 차단', () => {
  it('행위자가 보유하지 않은 권한은 부여할 수 없다', async () => {
    mocks.roleFindUnique.mockResolvedValue(otherRole);
    mocks.permissionFindMany.mockResolvedValue([
      { resource: 'USER', action: 'DELETE' },
      { resource: 'SR', action: 'DELETE' },
    ]);

    await expect(
      service.updateRolePermissions('r-2', ['p-1', 'p-2'], roleManager.id, null, roleManager)
    ).rejects.toThrow(/보유하지 않은 권한/);

    // 차단됐다면 쓰기가 일어나선 안 된다.
    expect(mocks.rolePermissionDeleteMany).not.toHaveBeenCalled();
  });

  it('자기가 보유한 권한은 부여할 수 있다', async () => {
    mocks.roleFindUnique.mockResolvedValue(otherRole);
    mocks.permissionFindMany.mockResolvedValue([{ resource: 'ROLE', action: 'READ' }]);

    await expect(
      service.updateRolePermissions('r-2', ['p-role-read'], roleManager.id, null, roleManager)
    ).resolves.toBeDefined();
  });

  it('대상 역할이 이미 갖고 있던 권한은 유지해도 상승이 아니다', async () => {
    // 권한 교체는 전체 목록을 다시 보내는 방식이다. 기존 권한을 함께 보냈다고
    // 상승으로 막으면 정상 편집이 전부 불가능해진다.
    mocks.roleFindUnique.mockResolvedValue(otherRole);
    mocks.rolePermissionFindMany.mockResolvedValue([
      { permission: { resource: 'USER', action: 'DELETE' } },
    ]);
    mocks.permissionFindMany.mockResolvedValue([{ resource: 'USER', action: 'DELETE' }]);

    await expect(
      service.updateRolePermissions('r-2', ['p-user-delete'], roleManager.id, null, roleManager)
    ).resolves.toBeDefined();
  });

  it('자기가 보유한 역할은 대상으로 삼을 수 없다', async () => {
    mocks.roleFindUnique.mockResolvedValue({ id: 'r-1', name: 'ROLE_MANAGER', description: null });

    await expect(
      service.updateRolePermissions('r-1', [], roleManager.id, null, roleManager)
    ).rejects.toThrow(/자신이 보유한 역할/);
  });

  it('ADMIN 역할은 대상으로 삼을 수 없다', async () => {
    mocks.roleFindUnique.mockResolvedValue({ id: 'r-admin', name: 'ADMIN', description: null });

    await expect(
      service.updateRolePermissions('r-admin', [], roleManager.id, null, roleManager)
    ).rejects.toThrow(/ADMIN 역할/);
  });

  it('ADMIN 은 제약을 받지 않는다', async () => {
    mocks.roleFindUnique.mockResolvedValue(otherRole);
    mocks.permissionFindMany.mockResolvedValue([{ resource: 'USER', action: 'DELETE' }]);

    await expect(
      service.updateRolePermissions('r-2', ['p-1'], admin.id, null, admin)
    ).resolves.toBeDefined();
  });

  it('actor 가 없으면 시스템 호출로 보고 통과시킨다', async () => {
    // 시드처럼 요청 컨텍스트가 없는 호출을 막으면 부팅이 깨진다.
    mocks.roleFindUnique.mockResolvedValue(otherRole);

    await expect(service.updateRolePermissions('r-2', [])).resolves.toBeDefined();
  });
});

describe('updateRole — 이름 보호와 자기 역할 보호', () => {
  it("역할 이름을 'ADMIN' 으로 바꿀 수 없다", async () => {
    // 이름만 바꿔도 코드베이스 전역의 roles.includes('ADMIN') 검사가 통과한다.
    mocks.roleFindUnique.mockResolvedValue(otherRole);

    await expect(
      service.updateRole('r-2', { name: 'ADMIN' }, roleManager.id, null, roleManager)
    ).rejects.toThrow(/기본 역할 이름/);
  });

  it('대소문자를 바꿔도 막는다', async () => {
    mocks.roleFindUnique.mockResolvedValue(otherRole);

    await expect(
      service.updateRole('r-2', { name: 'admin' }, roleManager.id, null, roleManager)
    ).rejects.toThrow(/기본 역할 이름/);
  });

  it('평범한 이름 변경은 허용한다', async () => {
    mocks.roleFindUnique.mockResolvedValue(otherRole);

    await expect(
      service.updateRole('r-2', { name: 'SUPPORT_LEAD' }, roleManager.id, null, roleManager)
    ).resolves.toBeDefined();
  });

  it('ADMIN 역할 자체는 수정할 수 없다', async () => {
    mocks.roleFindUnique.mockResolvedValue({ id: 'r-admin', name: 'ADMIN', description: null });

    await expect(
      service.updateRole('r-admin', { description: 'x' }, roleManager.id, null, roleManager)
    ).rejects.toThrow(/ADMIN 역할/);
  });
});

describe('deleteRole — 기본 역할 보호', () => {
  it('기본 역할은 삭제할 수 없다', async () => {
    mocks.roleFindUnique.mockResolvedValue({ id: 'r-admin', name: 'ADMIN', description: null });

    await expect(service.deleteRole('r-admin', roleManager.id, null, roleManager)).rejects.toThrow(
      /기본 역할/
    );
  });

  it('자기가 보유한 역할은 삭제할 수 없다', async () => {
    mocks.roleFindUnique.mockResolvedValue({ id: 'r-1', name: 'ROLE_MANAGER', description: null });

    await expect(service.deleteRole('r-1', roleManager.id, null, roleManager)).rejects.toThrow(
      /자신이 보유한 역할/
    );
  });

  it('그 외 역할은 삭제할 수 있다', async () => {
    mocks.roleFindUnique.mockResolvedValue(otherRole);

    await expect(
      service.deleteRole('r-2', roleManager.id, null, roleManager)
    ).resolves.toBeDefined();
  });
});

/**
 * createRole 만 오랫동안 형제 연산과 달랐다.
 *
 * update/delete 는 감사 3.11 에서 서비스 계층으로 가드를 옮겼는데 생성 경로는 빠져,
 * `ensureCanCreateRole` 이 정의만 된 채 아무도 부르지 않았다(knip 이 미사용 export 로
 * 신고해서 드러났다). 더 실질적인 문제는 액션이 actor 를 아예 넘기지 않아
 * **ROLE_CREATE 감사 로그의 userId 가 비어 있었다**는 점이다 — 감사 로그가 답해야 할
 * 바로 그 질문("누가 이 역할을 만들었나")에 답할 수 없었다.
 */
describe('createRole — 생성 권한과 감사 행위자', () => {
  it('생성 권한이 없으면 거부한다', async () => {
    // ROLE:READ/UPDATE/DELETE 는 있지만 ROLE:CREATE 는 없는 역할 관리자.
    await expect(
      service.createRole({ name: 'NEW_ROLE' }, roleManager.id, null, roleManager as never)
    ).rejects.toThrow('역할 생성 권한이 없습니다.');

    // 거부는 '던졌다' 가 아니라 '행이 안 생겼다' 로 확인해야 의미가 있다.
    expect(mocks.roleCreate).not.toHaveBeenCalled();
  });

  it('ROLE:CREATE 보유자는 생성할 수 있다 — 과잉 차단 방지 대조군', async () => {
    const creator = { ...roleManager, permissions: ['ROLE:CREATE'] };

    await expect(
      service.createRole({ name: 'NEW_ROLE' }, creator.id, null, creator as never)
    ).resolves.toMatchObject({ name: 'NEW_ROLE' });
  });

  it('감사 로그에 행위자를 남긴다', async () => {
    await service.createRole({ name: 'NEW_ROLE' }, admin.id, '10.0.0.1', admin as never);

    expect(mocks.createLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: admin.id,
        actionType: 'ROLE_CREATE',
        ipAddress: '10.0.0.1',
      })
    );
  });

  // 시드·마이그레이션 스크립트는 세션이 없다. 클래스 주석이 명시한 계약이다.
  it('actor 가 없으면 시스템 호출로 보고 통과시킨다', async () => {
    await expect(service.createRole({ name: 'SEEDED' })).resolves.toMatchObject({
      name: 'SEEDED',
    });
  });
});

/**
 * 기본 역할 5개는 ADMIN 도 이름을 바꾸거나 지울 수 없다(헌법 §1.4, 2026-09-18 소유자 결정 RB-12).
 *
 * 세션에는 역할 이름만 실리고 정책·메뉴·알림·가입이 그 이름으로 판정한다. 예전에는 보호 목록이
 * ADMIN·USER·GUEST 였다 — USER·GUEST 는 이 시스템에 없는 이름이라 실제로는 ADMIN 하나만 보호됐고,
 * ADMIN 은 이름 검사를 건너뛰었다. 그래서 MANAGER 를 개명하면 운영 관리자 전원의 SR 목록이 비었고,
 * 비워진 'MANAGER' 를 커스텀 역할이 차지하면 그 사용자가 내부 사용자로 판정됐다.
 * 권한 구성은 ADMIN 이 조정하는 기본값이므로 막지 않는다 — 과잉 차단 대조군을 함께 둔다.
 */
describe('기본 역할 보호 — ADMIN 도 이름을 바꾸거나 지울 수 없다', () => {
  const managerRole = { id: 'r-mgr', name: 'MANAGER', description: '운영 관리자' };

  it('기본 역할의 이름은 ADMIN 도 바꿀 수 없다', async () => {
    mocks.roleFindUnique.mockResolvedValue(managerRole);

    await expect(
      service.updateRole('r-mgr', { name: 'OPS_MANAGER' }, admin.id, null, admin)
    ).rejects.toThrow('기본 역할(MANAGER)의 이름은 바꿀 수 없습니다.');
    expect(mocks.roleUpdate).not.toHaveBeenCalled();
  });

  it('이름을 그대로 보내고 설명만 고치는 것은 허용한다 — 수정 폼은 이름을 늘 보낸다', async () => {
    mocks.roleFindUnique.mockResolvedValue(managerRole);

    await expect(
      service.updateRole(
        'r-mgr',
        { name: 'MANAGER', description: 'SR 접수·배정' },
        admin.id,
        null,
        admin
      )
    ).resolves.toMatchObject({ description: 'SR 접수·배정' });
  });

  it('ADMIN 도 커스텀 역할을 기본 역할 이름(대소문자 무시)으로 바꿀 수 없다', async () => {
    mocks.roleFindUnique.mockResolvedValue(otherRole);

    await expect(
      service.updateRole('r-2', { name: 'Engineer' }, admin.id, null, admin)
    ).rejects.toThrow('기본 역할 이름(Engineer)은 쓸 수 없습니다.');
    expect(mocks.roleUpdate).not.toHaveBeenCalled();
  });

  it('ADMIN 도 기본 역할 이름으로 새 역할을 만들 수 없다', async () => {
    await expect(
      service.createRole({ name: ' client_admin ' }, admin.id, null, admin as never)
    ).rejects.toThrow(/기본 역할 이름/);
    expect(mocks.roleCreate).not.toHaveBeenCalled();
  });

  it('사용자가 0명이어도 기본 역할은 ADMIN 도 지울 수 없다', async () => {
    mocks.roleFindUnique.mockResolvedValue({ id: 'r-cu', name: 'CLIENT_USER', description: null });
    mocks.userRoleCount.mockResolvedValue(0);

    await expect(service.deleteRole('r-cu', admin.id, null, admin)).rejects.toThrow(
      '기본 역할은 삭제할 수 없습니다.'
    );
    expect(mocks.roleDelete).not.toHaveBeenCalled();
  });

  it('기본 역할의 권한 구성은 ADMIN 이 조정할 수 있다 — 역할별 권한은 기본값이다', async () => {
    mocks.roleFindUnique.mockResolvedValue(managerRole);
    mocks.permissionFindMany.mockResolvedValue([{ resource: 'ROLE', action: 'ASSIGN' }]);

    await expect(
      service.updateRolePermissions('r-mgr', ['p-role-assign'], admin.id, null, admin)
    ).resolves.toBeDefined();
    expect(mocks.rolePermissionCreateMany).toHaveBeenCalled();
  });
});
