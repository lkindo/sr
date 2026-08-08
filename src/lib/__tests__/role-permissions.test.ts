import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';
import { expandRolePermissions, invalidateRolePermissions } from '@/lib/role-permissions';

vi.mock('@/lib/prisma', () => ({
  default: {
    role: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** `role.findMany` 가 돌려주는 형태를 간단히 만든다. */
const rolesFixture = (map: Record<string, string[]>) =>
  Object.entries(map).map(([name, permissions]) => ({
    name,
    permissions: permissions.map((p) => {
      const [resource, action] = p.split(':');
      return { permission: { resource, action } };
    }),
  }));

describe('expandRolePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 캐시는 모듈 수준 상태다. 테스트 간에 새지 않도록 매번 버린다.
    invalidateRolePermissions();
  });

  it('역할 이름을 권한 문자열로 편다', async () => {
    vi.mocked(prisma.role.findMany).mockResolvedValue(
      rolesFixture({ ADMIN: ['SR:CREATE', 'SR:DELETE'] }) as never
    );

    await expect(expandRolePermissions(['ADMIN'])).resolves.toEqual(['SR:CREATE', 'SR:DELETE']);
  });

  it('여러 역할의 권한을 합치고 중복은 한 번만 담는다', async () => {
    vi.mocked(prisma.role.findMany).mockResolvedValue(
      rolesFixture({
        MANAGER: ['SR:READ', 'SR:UPDATE'],
        ENGINEER: ['SR:READ', 'SR:STATUS_CHANGE'],
      }) as never
    );

    const granted = await expandRolePermissions(['MANAGER', 'ENGINEER']);

    expect(granted).toHaveLength(3);
    expect(new Set(granted)).toEqual(new Set(['SR:READ', 'SR:UPDATE', 'SR:STATUS_CHANGE']));
  });

  it('역할이 없으면 조회조차 하지 않는다', async () => {
    await expect(expandRolePermissions([])).resolves.toEqual([]);
    expect(prisma.role.findMany).not.toHaveBeenCalled();
  });

  it('모르는 역할 이름은 조용히 무시한다', async () => {
    vi.mocked(prisma.role.findMany).mockResolvedValue(
      rolesFixture({ ADMIN: ['SR:CREATE'] }) as never
    );

    await expect(expandRolePermissions(['없는역할'])).resolves.toEqual([]);
  });

  // 세션은 매 요청 읽힌다. 캐시가 없으면 요청마다 조인 쿼리가 하나씩 붙는다.
  it('두 번째 확장은 DB 를 다시 읽지 않는다', async () => {
    vi.mocked(prisma.role.findMany).mockResolvedValue(
      rolesFixture({ ADMIN: ['SR:CREATE'] }) as never
    );

    await expandRolePermissions(['ADMIN']);
    await expandRolePermissions(['ADMIN']);

    expect(prisma.role.findMany).toHaveBeenCalledTimes(1);
  });

  // 동시 요청이 만료를 함께 발견해도 쿼리는 한 번만 나가야 한다.
  it('동시 확장은 조회를 공유한다', async () => {
    vi.mocked(prisma.role.findMany).mockResolvedValue(
      rolesFixture({ ADMIN: ['SR:CREATE'] }) as never
    );

    await Promise.all([expandRolePermissions(['ADMIN']), expandRolePermissions(['ADMIN'])]);

    expect(prisma.role.findMany).toHaveBeenCalledTimes(1);
  });

  // 이것이 이 모듈에서 가장 중요한 계약이다. 무효화가 동작하지 않으면 회수한 권한이
  // 캐시 수명만큼 계속 유효하다.
  it('무효화 후에는 회수된 권한이 즉시 사라진다', async () => {
    vi.mocked(prisma.role.findMany).mockResolvedValue(
      rolesFixture({ ADMIN: ['SR:CREATE', 'SR:DELETE'] }) as never
    );
    await expect(expandRolePermissions(['ADMIN'])).resolves.toContain('SR:DELETE');

    vi.mocked(prisma.role.findMany).mockResolvedValue(
      rolesFixture({ ADMIN: ['SR:CREATE'] }) as never
    );
    invalidateRolePermissions();

    await expect(expandRolePermissions(['ADMIN'])).resolves.toEqual(['SR:CREATE']);
  });

  // 정책 계층은 fail-closed 다. 조회가 실패하면 "권한 없음" 이어야 하며,
  // 절대 접근이 열리는 방향으로 실패해서는 안 된다.
  it('조회가 실패하면 권한 없음으로 처리한다', async () => {
    vi.mocked(prisma.role.findMany).mockRejectedValue(new Error('DB down'));

    await expect(expandRolePermissions(['ADMIN'])).resolves.toEqual([]);
  });

  it('조회 실패 후에도 다음 요청에서 다시 시도한다', async () => {
    vi.mocked(prisma.role.findMany).mockRejectedValueOnce(new Error('DB down'));
    await expect(expandRolePermissions(['ADMIN'])).resolves.toEqual([]);

    vi.mocked(prisma.role.findMany).mockResolvedValue(
      rolesFixture({ ADMIN: ['SR:CREATE'] }) as never
    );
    await expect(expandRolePermissions(['ADMIN'])).resolves.toEqual(['SR:CREATE']);
  });
});
