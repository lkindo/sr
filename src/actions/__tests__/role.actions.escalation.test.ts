import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 3.11 회귀 테스트 — 서버 액션이 불변식을 우회하던 경로.
 *
 * `updateRoleAction` / `deleteRoleAction` / `updateRolePermissionsAction` 은
 * `authenticateAndAuthorize` 만 통과하면 서비스로 직행했다. 서비스는 actor 를 받지 않았으므로
 * "ADMIN 역할 불변" "시스템 역할 삭제 불가" 같은 불변식이 **REST 라우트에서만** 강제됐다.
 *
 * 가드를 서비스로 옮겼으니, 이제 이 액션들이 **actor 를 실제로 넘기는지**가 관건이다.
 * 안 넘기면 서비스가 시스템 호출로 간주해 전부 통과시킨다 — 겉보기엔 고쳐진 것 같지만
 * 실제로는 그대로 열려 있는 상태가 된다. 이 테스트가 그것을 막는다.
 */

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  updateRolePermissions: vi.fn(),
}));

const SESSION_USER = {
  id: 'u-1',
  email: 'rm@example.com',
  name: '역할 관리자',
  image: null,
  roles: ['ROLE_MANAGER'],
  permissions: ['ROLE:UPDATE'],
  clientIds: [],
};

// importActual 을 쓰면 실제 모듈이 next-auth 를 끌어와 테스트 환경에서 로드에 실패한다.
// 이 테스트가 보는 것은 "액션이 actor 를 서비스로 넘기는가" 하나이므로 완전 모킹으로 둔다.
vi.mock('@/lib/action-helpers', () => ({
  authenticateAndAuthorize: mocks.authorize,
  validateWithSchema: (data: unknown) => ({ success: true as const, data }),
}));

vi.mock('@/services/service-registry', () => ({
  services: {
    roleService: {
      updateRole: mocks.updateRole,
      deleteRole: mocks.deleteRole,
      updateRolePermissions: mocks.updateRolePermissions,
    },
  },
}));

import { deleteRoleAction, updateRoleAction, updateRolePermissionsAction } from '../role.actions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ user: SESSION_USER });
  mocks.updateRole.mockResolvedValue({ id: 'r-2', name: 'SUPPORT' });
  mocks.deleteRole.mockResolvedValue(undefined);
  mocks.updateRolePermissions.mockResolvedValue(undefined);
});

describe('역할 서버 액션이 actor 를 서비스에 전달한다', () => {
  it('updateRoleAction', async () => {
    const form = new FormData();
    form.set('name', 'SUPPORT_LEAD');

    await updateRoleAction('r-2', form);

    expect(mocks.updateRole).toHaveBeenCalledTimes(1);
    // 다섯 번째 인자가 actor 다. 없으면 서비스가 가드를 건너뛴다.
    expect(mocks.updateRole.mock.calls[0]![4]).toEqual(SESSION_USER);
  });

  it('deleteRoleAction', async () => {
    await deleteRoleAction('r-2');

    expect(mocks.deleteRole).toHaveBeenCalledTimes(1);
    expect(mocks.deleteRole.mock.calls[0]![3]).toEqual(SESSION_USER);
  });

  it('updateRolePermissionsAction', async () => {
    await updateRolePermissionsAction('r-2', ['p-1']);

    expect(mocks.updateRolePermissions).toHaveBeenCalledTimes(1);
    expect(mocks.updateRolePermissions.mock.calls[0]![4]).toEqual(SESSION_USER);
  });

  it('서비스가 거부하면 액션도 실패를 돌려준다', async () => {
    const { ForbiddenError } = await import('@/lib/errors');
    mocks.updateRolePermissions.mockRejectedValue(
      new ForbiddenError('본인이 보유하지 않은 권한은 부여할 수 없습니다: USER:DELETE')
    );

    const result = await updateRolePermissionsAction('r-2', ['p-1']);

    // 액션이 예외를 삼키고 성공으로 보고하면 UI 가 통과한 것처럼 보인다.
    expect(result.success).toBe(false);
  });
});
