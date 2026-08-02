import { APIRequestContext, expect, test } from '@playwright/test';
import path from 'path';

import { apiRequestWithRateLimitRetry } from './helpers/test-helpers';

/**
 * 역할 상호 배타성 (Role Exclusivity) E2E 테스트
 *
 * 검증 대상: src/app/api/users/[id]/roles/route.ts 의 세 가지 차단 규칙
 * 1. 시스템 운영팀(ADMIN/MANAGER/ENGINEER)과 고객사 팀(CLIENT_ADMIN/CLIENT_USER) 동시 부여 차단
 * 2. 고객사가 할당된 사용자에게 시스템 운영팀 역할 부여 차단
 * 3. 고객사가 할당되지 않은 사용자에게 고객사 팀 역할 부여 차단
 *
 * 이 스펙은 "차단되었다"를 응답 코드만으로 믿지 않고, 차단 이후 서버에 남은
 * 실제 역할 목록까지 확인한다. 통제가 사라지면(=200 이 되거나 역할이 실제로 부여되면)
 * 반드시 빨간불이 되어야 한다.
 *
 * 주의: playwright/.auth/manager.json 은 e2e/helpers/auth-helpers.ts 의 페르소나 정의상
 * admin@example.com(ADMIN) 세션이다. 역할 할당은 ADMIN 또는 ROLE:ASSIGN 이 필요하다.
 */

const authFiles = {
  admin: path.join(__dirname, '../playwright/.auth/manager.json'),
};

test.use({ storageState: authFiles.admin });

const SYSTEM_TEAM_ROLES = ['ADMIN', 'MANAGER', 'ENGINEER'] as const;
const CLIENT_TEAM_ROLES = ['CLIENT_ADMIN', 'CLIENT_USER'] as const;
const REQUIRED_ROLES = [...SYSTEM_TEAM_ROLES, ...CLIENT_TEAM_ROLES];

interface RoleSummary {
  id: string;
  name: string;
}

/**
 * 역할 카탈로그 조회 (GET /api/roles 는 배열을 그대로 반환한다)
 */
async function fetchRoleMap(request: APIRequestContext): Promise<Map<string, RoleSummary>> {
  const response = await apiRequestWithRateLimitRetry(request, 'get', '/api/roles');
  expect(response.status(), 'GET /api/roles 가 200 이어야 합니다.').toBe(200);

  const roles = (await response.json()) as RoleSummary[];
  expect(Array.isArray(roles), 'GET /api/roles 응답은 역할 배열이어야 합니다.').toBeTruthy();

  const map = new Map(roles.map((role) => [role.name, role]));
  for (const name of REQUIRED_ROLES) {
    expect(
      map.has(name),
      `역할 카탈로그에 '${name}' 이(가) 없으면 상호 배타성 검증 자체가 불가능합니다. ` +
        `prisma/seed.ts 를 먼저 실행하세요.`
    ).toBeTruthy();
  }
  return map;
}

/**
 * 사용자 상세 조회 (서버에 실제로 남은 상태를 확인하기 위한 단일 창구)
 */
async function fetchUser(
  request: APIRequestContext,
  userId: string
): Promise<{ roles?: Array<{ role: { name: string } }>; clients?: unknown[] }> {
  const response = await apiRequestWithRateLimitRetry(request, 'get', `/api/users/${userId}`);
  expect(response.status(), `GET /api/users/${userId} 가 200 이어야 합니다.`).toBe(200);
  return await response.json();
}

/**
 * 사용자의 현재 역할 이름 목록 (서버 상태 기준)
 */
async function fetchUserRoleNames(request: APIRequestContext, userId: string): Promise<string[]> {
  const user = await fetchUser(request, userId);
  return (user.roles ?? []).map((userRole) => userRole.role.name);
}

/**
 * 사용자의 고객사 소속 수 (PENDING 포함 — roles 라우트도 status 무관하게 센다)
 */
async function fetchUserClientCount(request: APIRequestContext, userId: string): Promise<number> {
  const user = await fetchUser(request, userId);
  return (user.clients ?? []).length;
}

/**
 * 테스트 준비: 사용자의 고객사 소속을 원하는 상태로 맞춘다.
 * 준비 단계가 실패하면 본 검증이 무의미하므로 즉시 실패시킨다.
 */
async function setUserClients(
  request: APIRequestContext,
  userId: string,
  clientIds: string[]
): Promise<void> {
  const response = await apiRequestWithRateLimitRetry(request, 'patch', `/api/users/${userId}`, {
    data: { clientIds },
  });
  expect(
    response.status(),
    `테스트 준비 실패: PATCH /api/users/${userId} (clientIds=${JSON.stringify(clientIds)})`
  ).toBe(200);

  const expectedCount = clientIds.length;
  expect(
    await fetchUserClientCount(request, userId),
    `테스트 준비 실패: 고객사 소속 수가 ${expectedCount} 이어야 합니다.`
  ).toBe(expectedCount);
}

// 하나의 테스트 사용자를 순차적으로 재사용하므로 serial 로 고정한다.
test.describe.configure({ mode: 'serial' });

test.describe('역할 상호 배타성 테스트', () => {
  let testUserId: string;
  let testClientId: string;
  let roleMap: Map<string, RoleSummary>;

  test.beforeEach(() => {
    // STRICT rate limit(1분당 5회) 재시도 대기를 흡수할 수 있도록 타임아웃을 넉넉히 준다.
    test.setTimeout(180_000);
  });

  test.beforeAll(async ({ request }) => {
    test.setTimeout(180_000);

    roleMap = await fetchRoleMap(request);

    // 고객사 목록 (GET /api/clients 는 { data, meta } 페이지네이션 형태다)
    const clientsResponse = await apiRequestWithRateLimitRetry(request, 'get', '/api/clients');
    expect(clientsResponse.status(), 'GET /api/clients 가 200 이어야 합니다.').toBe(200);
    const clientsBody = (await clientsResponse.json()) as { data?: Array<{ id: string }> };
    const clients = clientsBody.data ?? [];
    expect(
      clients.length,
      '고객사 픽스처가 없으면 "고객사 할당 여부"에 따른 규칙을 검증할 수 없습니다. ' +
        'prisma/seed.ts 의 TEST001/TEST002 고객사를 먼저 생성하세요.'
    ).toBeGreaterThan(0);
    testClientId = clients[0]!.id;

    // 테스트 전용 사용자 생성 (역할/고객사 모두 없는 상태로 시작)
    // 주의: /api/auth/register 라우트는 존재하지 않는다. 사용자 생성은 POST /api/users 뿐이다.
    const timestamp = Date.now();
    const createResponse = await apiRequestWithRateLimitRetry(request, 'post', '/api/users', {
      data: {
        name: `Role Exclusivity Test ${timestamp}`,
        email: `roletest${timestamp}@example.com`,
        password: 'Test1234!',
      },
    });
    expect(createResponse.status(), `테스트 사용자 생성 실패: ${await createResponse.text()}`).toBe(
      201
    );

    const createdUser = (await createResponse.json()) as { id: string };
    expect(createdUser.id, '생성된 사용자 ID를 받지 못했습니다.').toBeTruthy();
    testUserId = createdUser.id;

    expect(await fetchUserRoleNames(request, testUserId)).toEqual([]);
    expect(await fetchUserClientCount(request, testUserId)).toBe(0);
  });

  test.afterAll(async ({ request }) => {
    if (testUserId) {
      await request.delete(`/api/users/${testUserId}?hard=true`).catch(() => null);
    }
  });

  test('1. 시스템 운영팀과 고객사 팀 역할 동시 부여는 400 으로 차단된다', async ({ request }) => {
    const adminRole = roleMap.get('ADMIN')!;
    const clientAdminRole = roleMap.get('CLIENT_ADMIN')!;

    const response = await apiRequestWithRateLimitRetry(
      request,
      'post',
      `/api/users/${testUserId}/roles`,
      { data: { roleIds: [adminRole.id, clientAdminRole.id] } }
    );

    expect(
      response.status(),
      `ADMIN + CLIENT_ADMIN 동시 부여가 차단되지 않았습니다. 응답: ${await response.text()}`
    ).toBe(400);

    const body = (await response.json()) as {
      error?: string;
      systemRoles?: string[];
      clientRoles?: string[];
    };
    expect(body.systemRoles).toContain('ADMIN');
    expect(body.clientRoles).toContain('CLIENT_ADMIN');

    // 응답 코드만이 아니라 서버 상태로도 확인한다: 어떤 역할도 남아 있으면 안 된다.
    expect(
      await fetchUserRoleNames(request, testUserId),
      '차단되었는데도 역할이 실제로 부여되었습니다.'
    ).toEqual([]);
  });

  test('2. 고객사가 할당된 사용자에게 시스템 역할 부여는 400 으로 차단된다', async ({
    request,
  }) => {
    await setUserClients(request, testUserId, [testClientId]);

    const managerRole = roleMap.get('MANAGER')!;
    const response = await apiRequestWithRateLimitRetry(
      request,
      'post',
      `/api/users/${testUserId}/roles`,
      { data: { roleIds: [managerRole.id] } }
    );

    expect(
      response.status(),
      `고객사 할당 사용자에게 MANAGER 부여가 차단되지 않았습니다. 응답: ${await response.text()}`
    ).toBe(400);

    const body = (await response.json()) as {
      systemRoles?: string[];
      assignedClients?: Array<{ id: string; name: string }>;
    };
    expect(body.systemRoles).toContain('MANAGER');
    expect(body.assignedClients?.length ?? 0).toBeGreaterThan(0);

    expect(
      await fetchUserRoleNames(request, testUserId),
      'MANAGER 역할이 실제로 부여되어 테넌트 경계가 무너졌습니다.'
    ).not.toContain('MANAGER');
  });

  test('3. 고객사가 없는 사용자에게 고객사 팀 역할 부여는 400 으로 차단된다', async ({
    request,
  }) => {
    await setUserClients(request, testUserId, []);

    const clientUserRole = roleMap.get('CLIENT_USER')!;
    const response = await apiRequestWithRateLimitRetry(
      request,
      'post',
      `/api/users/${testUserId}/roles`,
      { data: { roleIds: [clientUserRole.id] } }
    );

    expect(
      response.status(),
      `고객사 미할당 사용자에게 CLIENT_USER 부여가 차단되지 않았습니다. 응답: ${await response.text()}`
    ).toBe(400);

    const body = (await response.json()) as { clientRoles?: string[] };
    expect(body.clientRoles).toContain('CLIENT_USER');

    expect(
      await fetchUserRoleNames(request, testUserId),
      '소속 고객사가 없는데도 CLIENT_USER 역할이 부여되었습니다.'
    ).not.toContain('CLIENT_USER');
  });

  test('4. 대조군: 고객사 할당 후에는 고객사 팀 역할 부여가 성공한다', async ({ request }) => {
    // 1~3번의 400 이 "규칙에 의한 차단"인지 "무조건 거부"인지 구분하기 위한 대조군이다.
    await setUserClients(request, testUserId, [testClientId]);

    const clientUserRole = roleMap.get('CLIENT_USER')!;
    const response = await apiRequestWithRateLimitRetry(
      request,
      'post',
      `/api/users/${testUserId}/roles`,
      { data: { roleIds: [clientUserRole.id] } }
    );

    expect(
      response.status(),
      `정상 경로가 막혔습니다(과잉 차단). 응답: ${await response.text()}`
    ).toBe(200);

    expect(await fetchUserRoleNames(request, testUserId)).toEqual(['CLIENT_USER']);
  });

  test('5. 대조군: 고객사 미할당 사용자에게 시스템 역할 부여는 성공한다', async ({ request }) => {
    await setUserClients(request, testUserId, []);

    const engineerRole = roleMap.get('ENGINEER')!;
    const response = await apiRequestWithRateLimitRetry(
      request,
      'post',
      `/api/users/${testUserId}/roles`,
      { data: { roleIds: [engineerRole.id] } }
    );

    expect(
      response.status(),
      `정상 경로가 막혔습니다(과잉 차단). 응답: ${await response.text()}`
    ).toBe(200);

    // 역할 교체는 원자적이므로 이전 CLIENT_USER 는 남아 있으면 안 된다.
    expect(await fetchUserRoleNames(request, testUserId)).toEqual(['ENGINEER']);
  });
});

test.describe('역할 할당 UI 테스트', () => {
  test('사용자 목록: 시스템 운영팀 계정에는 고객사 할당 UI가 노출되지 않는다', async ({ page }) => {
    // src/components/users/UserTable.tsx 의 isSystemTeam 분기 검증.
    // 이 분기가 사라지면 ADMIN 계정에도 '고객사 할당' 드롭다운이 노출되어
    // 서버가 막고 있는 상호 배타성 규칙을 UI 가 유도하게 된다.
    // networkidle 은 쓰지 않는다: 로그인 상태의 모든 페이지가 루트 레이아웃
    // (src/app/layout.tsx → ClientLayout → RealtimeProvider → use-realtime-status.ts)에서
    // /api/realtime SSE 스트림을 계속 열어 두므로 "네트워크 유휴" 상태가 오지 않고
    // goto 가 항상 30초 뒤 타임아웃난다. 내비게이션은 domcontentloaded 로 확정하고,
    // 실제로 필요한 목록 데이터는 GET /api/users 응답으로 기다린다.
    const usersApiResponse = page
      .waitForResponse(
        (resp) => resp.url().includes('/api/users') && resp.request().method() === 'GET',
        { timeout: 20000 }
      )
      .catch(() => null);
    await page.goto('/users?q=admin%40example.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await usersApiResponse;

    const table = page.locator('table:not([data-skeleton])');
    await expect(table).toBeVisible({ timeout: 15000 });
    await expect(table.getByRole('columnheader', { name: '역할' })).toBeVisible();

    const adminRow = page.locator('tbody tr').filter({ hasText: 'admin@example.com' }).first();
    await expect(
      adminRow,
      '시드된 admin@example.com 계정 행을 찾지 못했습니다. prisma/seed.ts 를 확인하세요.'
    ).toBeVisible({ timeout: 15000 });

    // 시스템 운영팀 역할 배지가 있어야 하고
    await expect(adminRow.getByText('ADMIN', { exact: true })).toBeVisible();
    // 고객사 열은 '할당 불가' 이며
    await expect(adminRow.getByText('할당 불가', { exact: true })).toBeVisible();
    // 고객사 할당 트리거는 존재하지 않아야 한다.
    await expect(adminRow.getByRole('button', { name: /고객사 할당/ })).toHaveCount(0);
  });
});

test.describe('역할 카탈로그 정합성 테스트', () => {
  test('상호 배타성 검증에 필요한 5개 역할이 모두 존재한다', async ({ request }) => {
    const roleMap = await fetchRoleMap(request);
    expect(Array.from(roleMap.keys()).sort()).toEqual(expect.arrayContaining([...REQUIRED_ROLES]));
  });
});
