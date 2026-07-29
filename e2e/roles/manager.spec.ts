import { APIRequestContext, expect, test } from '@playwright/test';

import { PERSONA_AUTH_FILES } from '../helpers/auth-helpers';
import { apiRequestWithRateLimitRetry } from '../helpers/test-helpers';

/**
 * MANAGER 역할 행동 스펙.
 *
 * MANAGER 는 `INTERNAL_ROLES`(src/lib/policies.ts) 에 속하는 내부 사용자다.
 * 따라서 소속 고객사(userClient)가 하나도 없어도 전 고객사 데이터를 볼 수 있어야 한다.
 * 이 파일의 양성 테스트들은 "테넌트 격리 수정이 내부 사용자까지 과잉 차단하지 않았는가"를 지킨다.
 *
 * 동시에 MANAGER 는 ADMIN 이 아니다. prisma/seed.ts 의 MANAGER 권한 집합에는
 * ROLE 리소스 권한이 하나도 없으므로 역할/권한 카탈로그와 시스템 설정은 반드시 막혀야 한다.
 *
 * 세션 계정/역할 자체는 role-persona-setup(e2e/auth-multi-user.setup.ts)에서 이미 검증된다.
 * 여기서는 그 세션으로 실제 API 가 어떻게 응답하는지를 검증한다.
 */

test.use({ storageState: PERSONA_AUTH_FILES.manager });

const MANAGER_EMAIL = process.env.TEST_MANAGER_ROLE_EMAIL || 'manageruser@example.com';
const CLIENT_USER_EMAIL = process.env.TEST_CLIENT_EMAIL || 'clientuser@example.com';

/** 시드 고객사 코드 (prisma/seed.ts) */
const CLIENT_CODE_A = 'TEST001';
const CLIENT_CODE_B = 'TEST002';

interface SessionUser {
  id: string;
  email: string;
  roles: string[];
  clientIds: string[];
}

interface Paginated<T> {
  data?: T[];
  meta?: { totalItems?: number };
}

interface ClientListItem {
  id: string;
  code: string;
  name: string;
}

interface SrListItem {
  id: string;
  srNumber: string;
  clientId: string;
}

interface UserListItem {
  id: string;
  email: string;
  clients?: Array<{ clientId: string }>;
}

/**
 * 현재 storageState 의 NextAuth 세션을 가져온다.
 * (JWT 전략이므로 /api/auth/session 응답이 곧 세션 콜백 결과다.)
 */
async function fetchSessionUser(request: APIRequestContext): Promise<SessionUser> {
  const response = await request.get('/api/auth/session');
  expect(response.status(), 'GET /api/auth/session 이 200 이어야 합니다.').toBe(200);

  const body = (await response.json()) as { user?: Partial<SessionUser> };
  expect(
    body.user,
    'MANAGER 세션이 비어 있습니다. role-persona-setup 을 먼저 확인하세요.'
  ).toBeTruthy();

  return {
    id: body.user!.id ?? '',
    email: body.user!.email ?? '',
    roles: body.user!.roles ?? [],
    clientIds: body.user!.clientIds ?? [],
  };
}

/**
 * 고객사 코드 → 고객사 로 매핑. MANAGER 는 내부 사용자이므로 전 고객사가 보여야 한다.
 */
async function fetchClientsByCode(
  request: APIRequestContext
): Promise<Map<string, ClientListItem>> {
  const response = await apiRequestWithRateLimitRetry(request, 'get', '/api/clients?pageSize=100');
  expect(
    response.status(),
    `MANAGER 가 고객사 목록을 조회하지 못했습니다. 응답: ${await response.text()}`
  ).toBe(200);

  const body = (await response.json()) as Paginated<ClientListItem>;
  const clients = body.data ?? [];

  const byCode = new Map(clients.map((client) => [client.code, client]));
  for (const code of [CLIENT_CODE_A, CLIENT_CODE_B]) {
    expect(
      byCode.has(code),
      `시드 고객사 ${code} 가 없어 테넌트 경계를 검증할 수 없습니다. prisma/seed.ts 를 실행하세요.`
    ).toBeTruthy();
  }

  return byCode;
}

test.describe('MANAGER: 내부 사용자 데이터 접근 (양성)', () => {
  test('MANAGER 세션은 소속 고객사가 없는 내부 사용자다', async ({ request }) => {
    const user = await fetchSessionUser(request);

    expect(user.email, 'manager 페르소나가 다른 계정으로 로그인되어 있습니다.').toBe(MANAGER_EMAIL);
    // 완전 일치: ADMIN 겸직이 생기면 이후 "MANAGER 는 ADMIN 이 아니다" 검증이 무의미해진다.
    expect([...user.roles].sort(), 'MANAGER 페르소나는 MANAGER 역할만 가져야 합니다.').toEqual([
      'MANAGER',
    ]);
    // 소속이 0 이어야만 "소속 없이도 보인다"는 이후 단언이 내부 사용자 우회를 증명한다.
    expect(user.clientIds, 'MANAGER 는 고객사 소속이 없어야 합니다 (prisma/seed.ts 계약).').toEqual(
      []
    );
  });

  test('MANAGER 는 소속 고객사가 없어도 타 고객사의 SR 을 조회한다', async ({ request }) => {
    const user = await fetchSessionUser(request);
    expect(user.clientIds, 'MANAGER 소속이 생기면 이 테스트의 전제가 깨집니다.').toEqual([]);

    const clientsByCode = await fetchClientsByCode(request);
    const clientA = clientsByCode.get(CLIENT_CODE_A)!;

    // (1) 소속이 0 개인데도 전체 목록이 비어 있지 않아야 한다.
    //     외부 사용자 경로였다면 src/app/api/srs/route.ts 가 곧바로 빈 목록을 돌려준다.
    const allResponse = await apiRequestWithRateLimitRetry(request, 'get', '/api/srs?pageSize=100');
    expect(
      allResponse.status(),
      `MANAGER 가 SR 목록을 조회하지 못했습니다. 응답: ${await allResponse.text()}`
    ).toBe(200);

    const allBody = (await allResponse.json()) as Paginated<SrListItem>;
    expect(
      (allBody.data ?? []).length,
      'MANAGER 가 SR 을 하나도 보지 못했습니다. 내부 사용자 우회(isInternalUser)가 깨졌거나 시드 SR 이 없습니다.'
    ).toBeGreaterThan(0);
    expect(allBody.meta?.totalItems ?? 0).toBeGreaterThan(0);

    // (2) 소속되지 않은 고객사(TEST001)를 clientId 로 직접 지목해도 그 고객사의 SR 이 보여야 한다.
    //     외부 사용자라면 소속에 없는 clientId 이므로 빈 목록으로 잘린다.
    const scopedResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/srs?clientId=${clientA.id}&pageSize=100`
    );
    expect(scopedResponse.status()).toBe(200);

    const scopedBody = (await scopedResponse.json()) as Paginated<SrListItem>;
    const foreignSrs = scopedBody.data ?? [];
    expect(
      foreignSrs.length,
      `MANAGER 가 비소속 고객사(${CLIENT_CODE_A})의 SR 을 보지 못했습니다. 내부 사용자가 과잉 차단되었습니다.`
    ).toBeGreaterThan(0);

    // 그 SR 들은 전부 MANAGER 가 소속되지 않은 고객사의 것이다.
    // (비소속이라는 전제는 위에서 user.clientIds 가 비어 있음을 단언해 이미 고정했다.
    //  여기서 다시 includes 를 확인하면 항상 거짓이라 아무것도 잡지 못한다.)
    for (const sr of foreignSrs) {
      expect(sr.clientId, `SR ${sr.srNumber} 의 고객사가 요청한 필터와 다릅니다.`).toBe(clientA.id);
    }
  });

  test('MANAGER 는 소속되지 않은 고객사 상세를 조회할 수 있다', async ({ request }) => {
    const user = await fetchSessionUser(request);
    const clientsByCode = await fetchClientsByCode(request);
    const clientB = clientsByCode.get(CLIENT_CODE_B)!;

    expect(
      user.clientIds.includes(clientB.id),
      `${CLIENT_CODE_B} 가 MANAGER 소속이면 비소속 조회 검증이 성립하지 않습니다.`
    ).toBeFalsy();

    const response = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/clients/${clientB.id}`
    );
    expect(
      response.status(),
      `MANAGER 가 비소속 고객사(${CLIENT_CODE_B}) 상세를 조회하지 못했습니다. ` +
        `canReadClient 의 내부 사용자 분기가 사라졌을 수 있습니다. 응답: ${await response.text()}`
    ).toBe(200);

    const client = (await response.json()) as ClientListItem;
    expect(client.code).toBe(CLIENT_CODE_B);
    expect(client.id).toBe(clientB.id);
  });

  test('MANAGER 는 소속이 없어도 고객사 소속 사용자를 조회한다', async ({ request }) => {
    const user = await fetchSessionUser(request);

    // 페이지 1 에 걸리는지 여부에 좌우되지 않도록 search 로 대상을 특정한다
    // (src/services/user.service.ts 의 getAllUsers 는 name/email contains 로 검색한다).
    const response = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/users?search=${encodeURIComponent(CLIENT_USER_EMAIL)}`
    );
    expect(
      response.status(),
      `MANAGER 가 사용자 목록을 조회하지 못했습니다. 응답: ${await response.text()}`
    ).toBe(200);

    const users = ((await response.json()) as Paginated<UserListItem>).data ?? [];
    const target = users.find((candidate) => candidate.email === CLIENT_USER_EMAIL);

    // clientuser@example.com 은 TEST001 소속이고 MANAGER 는 어떤 고객사에도 속하지 않는다.
    // 사용자 목록이 소속 기준으로 스코프되면 MANAGER 에게는 이 계정이 보이지 않게 된다.
    expect(
      target,
      `MANAGER 가 고객사 소속 사용자(${CLIENT_USER_EMAIL})를 보지 못했습니다. ` +
        '사용자 목록이 내부 사용자에게까지 소속 기준으로 스코프되고 있습니다.'
    ).toBeTruthy();

    // 그 사용자의 소속은 MANAGER 의 소속과 전혀 겹치지 않는다(= 소속 교집합 없이 보였다).
    const targetClientIds = (target!.clients ?? []).map((membership) => membership.clientId);
    expect(
      targetClientIds.length,
      `${CLIENT_USER_EMAIL} 의 고객사 소속이 없으면 이 검증이 성립하지 않습니다. prisma/seed.ts 를 확인하세요.`
    ).toBeGreaterThan(0);
    // MANAGER 는 소속이 비어 있으므로(위에서 단언) 대상과 겹칠 수 없다.
    // 즉 이 조회는 멤버십이 아니라 내부 역할 권한으로 통과한 것이다.
  });
});

test.describe('MANAGER: 관리자 전용 기능 차단 (음성)', () => {
  // prisma/seed.ts 의 MANAGER 권한 집합: SR / CLIENT(READ,UPDATE) / USER(READ,UPDATE,ASSIGN_ROLE)
  // / COMMENT / ATTACHMENT / DASHBOARD / NOTIFICATION. ROLE 리소스 권한은 전무하다.
  const adminOnlyEndpoints: Array<{ path: string; guard: string }> = [
    {
      path: '/api/roles',
      guard: 'src/app/api/roles/route.ts 의 ensureCanReadRole (ADMIN 또는 ROLE:READ)',
    },
    {
      path: '/api/permissions',
      guard: 'src/app/api/permissions/route.ts 의 ensureCanReadRole (ADMIN 또는 ROLE:READ)',
    },
    {
      path: '/api/settings/system',
      guard: "src/app/api/settings/system/route.ts 의 roles.includes('ADMIN') 검사",
    },
  ];

  for (const endpoint of adminOnlyEndpoints) {
    test(`MANAGER 는 ADMIN 이 아니다: GET ${endpoint.path} 는 403 이다`, async ({ request }) => {
      const response = await apiRequestWithRateLimitRetry(request, 'get', endpoint.path);

      expect(
        response.status(),
        `MANAGER 가 관리자 전용 엔드포인트(${endpoint.path})에 접근했습니다. ` +
          `가드: ${endpoint.guard}. 응답: ${await response.text()}`
      ).toBe(403);
    });
  }
});
