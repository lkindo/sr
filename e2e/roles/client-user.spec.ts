import { APIRequestContext, BrowserContext, expect, Page, test } from '@playwright/test';

import { deleteSeededSRs, type SeededSR, seedSR } from '../fixtures/sr';
import { PERSONA_AUTH_FILES } from '../helpers/auth-helpers';
import { apiRequestWithRateLimitRetry } from '../helpers/test-helpers';

/**
 * CLIENT_USER 역할 행동 스펙.
 *
 * e2e/roles/ 에는 MANAGER 와 CLIENT_ADMIN 만 있었다. CLIENT_USER 는 다른 스펙에서
 * "SR 을 만드는 손"으로만 쓰였을 뿐, 그 역할 자체의 경계를 검증하는 스펙이 없었다.
 *
 * CLIENT_USER 계약(실측 2026-08-09 + src/lib/policies.ts):
 *  - 외부 사용자다. 소속 고객사(TEST001)의 SR 만 보이고 자사 고객사 상세만 열린다.
 *  - 확인 완료(confirm)는 **신청자 본인만** 가능하다
 *    (src/app/api/srs/[id]/status/route.ts 의 confirm 분기).
 *  - 역할·권한 카탈로그와 시스템 설정은 전부 403 이다.
 *
 * 중복 회피: 사용자/고객사 **목록** 403 은 08-user-management.spec.ts 와
 * 09-client-management.spec.ts 의 'CLIENT_USER 경계' describe 가 이미 덮으므로
 * 여기서 다시 확인하지 않는다. 대신 그 두 파일이 다루지 않는
 * **고객사 상세의 테넌트 경계**(자사 200 / 타사 403)를 다룬다.
 *
 * 구성은 roles/manager.spec.ts 를 따른다 — (1) 세션 확인, (2) 양성 대조, (3) 음성.
 * 양성 대조가 없으면 "전부 403" 인 고장 상태에서도 음성 테스트가 전부 통과한다.
 */

test.use({ storageState: PERSONA_AUTH_FILES.client });

const CLIENT_USER_EMAIL = process.env.TEST_CLIENT_EMAIL || 'clientuser@example.com';

/** CLIENT_USER 가 소속된 고객사 (prisma/seed.ts) */
const OWN_CLIENT_CODE = 'TEST001';
/** CLIENT_USER 가 소속되지 않은 다른 테넌트 */
const OTHER_CLIENT_CODE = 'TEST002';

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

interface ServiceCategoryItem {
  id: string;
}

interface SrDetail {
  id: string;
  srNumber: string;
  status: string;
  clientId: string;
  requesterId: string;
  assigneeId: string | null;
}

const mainNav = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });

async function fetchSessionUser(request: APIRequestContext): Promise<SessionUser> {
  const response = await request.get('/api/auth/session');
  expect(response.status(), 'GET /api/auth/session 이 200 이어야 합니다.').toBe(200);

  const body = (await response.json()) as { user?: Partial<SessionUser> };
  expect(
    body.user,
    'CLIENT_USER 세션이 비어 있습니다. multi-user-setup 을 먼저 확인하세요.'
  ).toBeTruthy();

  return {
    id: body.user!.id ?? '',
    email: body.user!.email ?? '',
    roles: body.user!.roles ?? [],
    clientIds: body.user!.clientIds ?? [],
  };
}

async function fetchSrDetail(
  request: APIRequestContext,
  srId: string,
  who: string
): Promise<SrDetail> {
  const response = await apiRequestWithRateLimitRetry(request, 'get', `/api/srs/${srId}`);
  expect(
    response.status(),
    `${who} 로 GET /api/srs/${srId} 가 200 이어야 합니다. 응답: ${await response.text()}`
  ).toBe(200);
  return (await response.json()) as SrDetail;
}

let ownClientId: string;
let otherClientId: string;

/** 신청자가 CLIENT_USER 본인인 완료 SR — confirm 이 되어야 한다(양성). */
let ownRequestedSr: SeededSR;
/**
 * 신청자가 **내부 사용자(MANAGER)** 인 자사 완료 SR — 읽히지만 confirm 은 막혀야 한다(음성).
 *
 * 타 테넌트(TEST002)에 픽스처를 만들지 않는 이유: roles/client-admin.spec.ts 가
 * "TEST002 에 SR 이 있으면 재사용하고 없으면 만든다" 로 동작한다. 여기서 TEST002 SR 을
 * 만들면 그 스펙이 내 SR 을 재사용하다가 내 afterAll 삭제와 겹쳐 404 로 깨질 수 있다.
 * 그래서 테넌트 경계는 SR 이 아니라 **고객사 상세**(항상 존재하는 시드 데이터)로 검증하고,
 * SR 쪽은 "신청자" 축으로 자사 안에서 검증한다.
 */
let foreignRequesterSrId: string;

let managerContext: BrowserContext;
let managerRequest: APIRequestContext;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);

  // --- 1) 내부 사용자(MANAGER)로 고객사 식별자 확보 ---
  managerContext = await browser.newContext({ storageState: PERSONA_AUTH_FILES.manager });
  managerRequest = managerContext.request;

  const clientsResponse = await apiRequestWithRateLimitRetry(
    managerRequest,
    'get',
    '/api/clients?pageSize=100'
  );
  expect(
    clientsResponse.status(),
    `MANAGER 로 고객사 목록 조회 실패. 응답: ${await clientsResponse.text()}`
  ).toBe(200);

  const byCode = new Map(
    (((await clientsResponse.json()) as Paginated<ClientListItem>).data ?? []).map((client) => [
      client.code,
      client,
    ])
  );
  for (const code of [OWN_CLIENT_CODE, OTHER_CLIENT_CODE]) {
    expect(
      byCode.has(code),
      `시드 고객사 ${code} 가 없어 테넌트 경계를 검증할 수 없습니다. prisma/seed.ts 를 실행하세요.`
    ).toBeTruthy();
  }
  ownClientId = byCode.get(OWN_CLIENT_CODE)!.id;
  otherClientId = byCode.get(OTHER_CLIENT_CODE)!.id;

  // --- 2) 신청자 = CLIENT_USER 인 완료 SR (양성 대조용) ---
  ownRequestedSr = await seedSR(browser, {
    stage: 'COMPLETED',
    title: `CLIENT_USER 확인완료 대상 ${Date.now()}`,
  });

  // --- 3) 신청자 = MANAGER 인 자사 완료 SR (음성용) ---
  // seedSR 은 항상 CLIENT_USER 를 신청자로 쓰므로 여기서는 직접 만든다.
  const categoriesResponse = await apiRequestWithRateLimitRetry(
    managerRequest,
    'get',
    `/api/clients/${ownClientId}/categories`
  );
  expect(
    categoriesResponse.status(),
    `MANAGER 로 ${OWN_CLIENT_CODE} 서비스 카테고리 조회 실패. 응답: ${await categoriesResponse.text()}`
  ).toBe(200);
  const categories = (await categoriesResponse.json()) as ServiceCategoryItem[];
  expect(
    categories.length,
    `${OWN_CLIENT_CODE} 에 서비스 카테고리가 없어 SR 픽스처를 만들 수 없습니다.`
  ).toBeGreaterThan(0);

  const createResponse = await apiRequestWithRateLimitRetry(managerRequest, 'post', '/api/srs', {
    data: {
      title: `타인 신청 SR ${Date.now()}`,
      description: 'CLIENT_USER 의 confirm 권한 경계 검증을 위해 MANAGER 가 신청한 SR 입니다.',
      clientId: ownClientId,
      serviceCategoryId: categories[0]!.id,
      requestedPriority: 'MEDIUM',
    },
  });
  expect(
    createResponse.status(),
    `타인 신청 SR 픽스처 생성 실패. 응답: ${await createResponse.text()}`
  ).toBe(201);
  foreignRequesterSrId = ((await createResponse.json()) as SrDetail).id;

  // 접수 → 진행 → 완료. confirm 만 남은 상태로 만들어야 "확인 완료가 막힌다"가 의미를 갖는다.
  const engineerContext = await browser.newContext({ storageState: PERSONA_AUTH_FILES.engineer });
  try {
    const engineerSession = await fetchSessionUser(engineerContext.request);

    const intakeResponse = await apiRequestWithRateLimitRetry(
      managerRequest,
      'post',
      `/api/srs/${foreignRequesterSrId}/intake`,
      {
        data: {
          actualPriority: 'MEDIUM',
          estimatedHours: 4,
          estimatedCompletionDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          intakeNotes: 'E2E 픽스처 접수',
          assigneeId: engineerSession.id,
        },
      }
    );
    expect(
      intakeResponse.status(),
      `타인 신청 SR 접수 실패. 응답: ${await intakeResponse.text()}`
    ).toBe(200);

    for (const data of [
      { action: 'start' },
      { action: 'complete', resolutionDescription: 'E2E 픽스처 완료 처리' },
    ]) {
      const response = await apiRequestWithRateLimitRetry(
        engineerContext.request,
        'patch',
        `/api/srs/${foreignRequesterSrId}/status`,
        { data }
      );
      expect(
        response.status(),
        `타인 신청 SR 의 ${data.action} 전이 실패. 응답: ${await response.text()}`
      ).toBe(200);
    }
  } finally {
    await engineerContext.close();
  }
});

test.afterAll(async ({ browser }) => {
  await deleteSeededSRs(browser, [ownRequestedSr?.id, foreignRequesterSrId]);
  if (managerContext) {
    await managerContext.close();
  }
});

test.describe('CLIENT_USER: 자사 데이터 접근 (양성)', () => {
  test('CLIENT_USER 세션은 자사 하나에만 소속된 외부 사용자다', async ({ request }) => {
    const user = await fetchSessionUser(request);

    expect(user.email, 'client 페르소나가 다른 계정으로 로그인되어 있습니다.').toBe(
      CLIENT_USER_EMAIL
    );
    // 완전 일치 — 내부 역할 겸직이 생기면 아래 테넌트 검증이 통째로 무의미해진다.
    expect([...user.roles].sort(), 'client 페르소나는 CLIENT_USER 역할만 가져야 합니다.').toEqual([
      'CLIENT_USER',
    ]);
    expect(
      user.clientIds,
      `CLIENT_USER 는 ${OWN_CLIENT_CODE} 한 곳에만 소속되어야 합니다 (prisma/seed.ts 계약).`
    ).toEqual([ownClientId]);
  });

  test('자사 SR 목록은 비어 있지 않고 전부 자사 소속이다', async ({ request }) => {
    const response = await apiRequestWithRateLimitRetry(request, 'get', '/api/srs?pageSize=100');
    expect(
      response.status(),
      `CLIENT_USER 가 SR 목록을 조회하지 못했습니다. 응답: ${await response.text()}`
    ).toBe(200);

    const body = (await response.json()) as Paginated<SrDetail>;
    const srs = body.data ?? [];
    expect(
      srs.length,
      `CLIENT_USER 가 자사(${OWN_CLIENT_CODE}) SR 을 하나도 보지 못했습니다. ` +
        '외부 사용자 스코프(resolveClientIdFilter)가 과잉 차단 중이거나 시드 SR 이 없습니다.'
    ).toBeGreaterThan(0);
    expect(body.meta?.totalItems ?? 0).toBeGreaterThan(0);

    for (const sr of srs) {
      expect(
        sr.clientId,
        `SR ${sr.srNumber} 이 자사(${OWN_CLIENT_CODE})가 아닌데 목록에 노출되었습니다.`
      ).toBe(ownClientId);
    }
  });

  test('자기가 신청한 완료 SR 을 확인 완료 처리한다', async ({ request }) => {
    const user = await fetchSessionUser(request);
    const before = await fetchSrDetail(request, ownRequestedSr.id, 'CLIENT_USER');

    expect(before.status, '전제: 이 SR 은 COMPLETED 여야 합니다.').toBe('COMPLETED');
    expect(before.requesterId, '전제: 신청자가 CLIENT_USER 본인이어야 합니다.').toBe(user.id);

    const response = await apiRequestWithRateLimitRetry(
      request,
      'patch',
      `/api/srs/${ownRequestedSr.id}/status`,
      { data: { action: 'confirm' } }
    );
    expect(
      response.status(),
      `신청자 본인이 확인 완료를 하지 못했습니다(과잉 차단). 응답: ${await response.text()}`
    ).toBe(200);

    // 상태 코드만으로는 "200 인데 아무것도 안 바뀌었다"를 잡지 못한다.
    expect((await fetchSrDetail(request, ownRequestedSr.id, 'CLIENT_USER')).status).toBe(
      'CONFIRMED'
    );
  });
});

test.describe('CLIENT_USER: 경계 (음성)', () => {
  test('타 고객사 상세는 403 이고 자사 상세는 200 이다', async ({ request }) => {
    // 양성/음성을 한 테스트에 붙여 둔다. 자사 200 이 함께 확인되지 않으면
    // "고객사 상세 라우트가 통째로 죽은" 상태에서도 403 단언이 통과한다.
    const ownResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/clients/${ownClientId}`
    );
    expect(
      ownResponse.status(),
      `CLIENT_USER 가 자사(${OWN_CLIENT_CODE}) 상세를 조회하지 못했습니다(과잉 차단). ` +
        `응답: ${await ownResponse.text()}`
    ).toBe(200);
    expect(((await ownResponse.json()) as ClientListItem).code).toBe(OWN_CLIENT_CODE);

    const otherResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/clients/${otherClientId}`
    );
    expect(
      otherResponse.status(),
      `CLIENT_USER 가 타 고객사(${OTHER_CLIENT_CODE}) 상세를 조회했습니다. ` +
        'src/lib/policies.ts 의 canReadClient 테넌트 조건(isMemberOfClient)이 사라졌습니다. ' +
        `응답: ${await otherResponse.text()}`
    ).toBe(403);
  });

  test('남이 신청한 자사 SR 은 읽히지만 확인 완료는 403 이고 상태도 변하지 않는다', async ({
    request,
  }) => {
    const user = await fetchSessionUser(request);

    // 읽기는 열려 있다 — 자사 SR 이고 CLIENT_USER 는 SR:READ 를 가진다(canReadSR 의 소속 경로).
    const before = await fetchSrDetail(request, foreignRequesterSrId, 'CLIENT_USER');
    expect(before.clientId, '전제: 이 SR 은 자사 소속이어야 합니다.').toBe(ownClientId);
    expect(before.status, '전제: 이 SR 은 COMPLETED 여야 합니다.').toBe('COMPLETED');
    expect(
      before.requesterId,
      '전제: 신청자가 CLIENT_USER 본인이면 이 음성 검증이 성립하지 않습니다.'
    ).not.toBe(user.id);

    const response = await apiRequestWithRateLimitRetry(
      request,
      'patch',
      `/api/srs/${foreignRequesterSrId}/status`,
      { data: { action: 'confirm' } }
    );
    expect(
      response.status(),
      `CLIENT_USER 가 남이 신청한 SR 을 확인 완료 처리했습니다. ` +
        'src/app/api/srs/[id]/status/route.ts 의 confirm 신청자 검사가 사라졌습니다. ' +
        `응답: ${await response.text()}`
    ).toBe(403);

    // 상태 코드가 아니라 서버에 남은 상태로 판정한다("403 인데 쓰기는 됐다"를 잡기 위함).
    // 자기 세션이 아닌 MANAGER 세션으로도 다시 확인한다.
    expect((await fetchSrDetail(request, foreignRequesterSrId, 'CLIENT_USER')).status).toBe(
      'COMPLETED'
    );
    expect((await fetchSrDetail(managerRequest, foreignRequesterSrId, 'MANAGER')).status).toBe(
      'COMPLETED'
    );
  });

  // 사용자/고객사 **목록** 403 은 08 / 09 가 이미 덮으므로 여기서는 다루지 않는다.
  const blockedEndpoints: Array<{ path: string; guard: string }> = [
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

  for (const endpoint of blockedEndpoints) {
    test(`CLIENT_USER 에게 GET ${endpoint.path} 는 403 이다`, async ({ request }) => {
      const response = await apiRequestWithRateLimitRetry(request, 'get', endpoint.path);

      expect(
        response.status(),
        `CLIENT_USER 가 관리 카탈로그(${endpoint.path})에 접근했습니다. ` +
          `가드: ${endpoint.guard}. 응답: ${await response.text()}`
      ).toBe(403);
    });
  }
});

test.describe('CLIENT_USER: 네비게이션', () => {
  test('공통 메뉴는 보이고 내부 전용 메뉴는 노출되지 않는다', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const nav = mainNav(page);
    await expect(nav).toBeVisible();
    const labels = (await nav.getByRole('link').allInnerTexts())
      .map((text) => text.trim())
      .filter(Boolean);

    // src/config/navigation.ts: Dashboard / SR 관리 / 설정 은 roles 제한이 없다.
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'SR 관리', '설정']));
    // '조직 관리'·'권한 관리' 는 roles: ['ADMIN','MANAGER','ENGINEER'] 이므로 없어야 한다.
    expect(labels, "CLIENT_USER 에게 '조직 관리' 메뉴가 노출되었습니다.").not.toContain(
      '조직 관리'
    );
    expect(labels, "CLIENT_USER 에게 '권한 관리' 메뉴가 노출되었습니다.").not.toContain(
      '권한 관리'
    );
  });
});
