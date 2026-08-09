import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { deleteSeededSRs, type SeededSR, seedSR } from '../fixtures/sr';
import { PERSONA_AUTH_FILES } from '../helpers/auth-helpers';
import { apiRequestWithRateLimitRetry } from '../helpers/test-helpers';

/**
 * ENGINEER 역할 행동 스펙.
 *
 * 지금까지 e2e/roles/ 에는 MANAGER 와 CLIENT_ADMIN 만 있었다. ENGINEER 는
 * sr-permissions.spec.ts 가 "배정되지 않은 SR 은 403" 두 건을 덮을 뿐,
 * **할 수 있어야 하는 일**을 검증하는 스펙이 하나도 없었다. 음성만 있는 상태에서는
 * 전부 403 인 고장(예: 엔지니어 권한 집합이 통째로 비는 회귀)도 초록불이 된다.
 *
 * ENGINEER 계약(실측 2026-08-09 + src/lib/policies.ts):
 *  - 내부 사용자(INTERNAL_ROLES)라 고객사 소속이 없어도 고객사 목록·상세가 보인다.
 *  - SR 은 **자신에게 배정된 것만** 읽고 쓸 수 있다(canReadSR/canUpdateSR 의 ENGINEER 분기).
 *  - 그 SR 의 상태 전이(start/complete)가 ENGINEER 의 본업이다.
 *  - 사용자·역할·권한 카탈로그와 시스템 설정은 막혀 있다(시드 권한 집합에
 *    USER:READ / ROLE:* 가 없다).
 *
 * 구성은 roles/manager.spec.ts 를 따른다 — (1) 세션 확인, (2) 양성 대조, (3) 음성.
 */

test.use({ storageState: PERSONA_AUTH_FILES.engineer });

const ENGINEER_EMAIL = process.env.TEST_ENGINEER_EMAIL || 'engineeruser@example.com';

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

/** SR 목록 행. 목록↔상세 일관성 검증에 필요한 필드만. */
interface SrListItem {
  id: string;
  srNumber: string;
}

interface SrDetail {
  id: string;
  srNumber: string;
  status: string;
  assigneeId: string | null;
  requesterId: string;
}

/**
 * 데스크톱 상단 네비게이션. navigation.spec.ts 와 같은 방식으로 이름으로 집는다 —
 * 헤더에는 '사용자 메뉴' nav 도, 사이드바에도 nav 가 있어서 위치로 집으면 엉뚱한 걸 본다.
 */
const mainNav = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });

async function fetchSessionUser(request: APIRequestContext): Promise<SessionUser> {
  const response = await request.get('/api/auth/session');
  expect(response.status(), 'GET /api/auth/session 이 200 이어야 합니다.').toBe(200);

  const body = (await response.json()) as { user?: Partial<SessionUser> };
  expect(
    body.user,
    'ENGINEER 세션이 비어 있습니다. multi-user-setup 을 먼저 확인하세요.'
  ).toBeTruthy();

  return {
    id: body.user!.id ?? '',
    email: body.user!.email ?? '',
    roles: body.user!.roles ?? [],
    clientIds: body.user!.clientIds ?? [],
  };
}

async function fetchSrDetail(request: APIRequestContext, srId: string): Promise<SrDetail> {
  const response = await apiRequestWithRateLimitRetry(request, 'get', `/api/srs/${srId}`);
  expect(
    response.status(),
    `ENGINEER 가 배정된 SR(${srId}) 상세를 조회하지 못했습니다. 응답: ${await response.text()}`
  ).toBe(200);
  return (await response.json()) as SrDetail;
}

/**
 * 테스트마다 독립된 SR 을 쓴다.
 *
 * 하나를 돌려 쓰면 상태 전이 테스트가 다른 테스트의 전제를 무너뜨려서
 * `mode: 'serial'` 로 묶어야 하고, 그러면 1번이 실패했을 때 나머지가 "미검증"인데
 * 리포트에는 실패 1건으로만 보인다(README Best Practices 6).
 */
let srForRead: SeededSR;
let srForTransition: SeededSR;
let srForConfirm: SeededSR;
let srForDelete: SeededSR;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);

  // seedSR 의 기본 담당자가 ENGINEER 페르소나다(fixtures/sr.ts 의 ENGINEER_EMAIL).
  srForRead = await seedSR(browser, { stage: 'INTAKE', title: `ENGINEER 조회 대상 ${Date.now()}` });
  srForTransition = await seedSR(browser, {
    stage: 'INTAKE',
    title: `ENGINEER 전이 대상 ${Date.now()}`,
  });
  srForConfirm = await seedSR(browser, {
    stage: 'COMPLETED',
    title: `ENGINEER 확인권한 대상 ${Date.now()}`,
  });
  srForDelete = await seedSR(browser, {
    stage: 'INTAKE',
    title: `ENGINEER 삭제권한 대상 ${Date.now()}`,
  });
});

test.afterAll(async ({ browser }) => {
  await deleteSeededSRs(browser, [
    srForRead?.id,
    srForTransition?.id,
    srForConfirm?.id,
    srForDelete?.id,
  ]);
});

test.describe('ENGINEER: 내부 사용자로서 할 수 있는 일 (양성)', () => {
  test('ENGINEER 세션은 고객사 소속이 없는 내부 사용자다', async ({ request }) => {
    const user = await fetchSessionUser(request);

    expect(user.email, 'engineer 페르소나가 다른 계정으로 로그인되어 있습니다.').toBe(
      ENGINEER_EMAIL
    );
    // 완전 일치로 본다 — ADMIN/MANAGER 겸직이 생기면 아래 음성 검증이 통째로 무의미해진다.
    expect([...user.roles].sort(), 'ENGINEER 페르소나는 ENGINEER 역할만 가져야 합니다.').toEqual([
      'ENGINEER',
    ]);
    // 소속이 0 이어야만 "소속 없이도 고객사가 보인다"가 내부 사용자 우회의 증거가 된다.
    expect(
      user.clientIds,
      'ENGINEER 는 고객사 소속이 없어야 합니다 (prisma/seed.ts 계약).'
    ).toEqual([]);
  });

  test('ENGINEER 는 소속이 없어도 전 고객사 목록과 비소속 고객사 상세를 조회한다', async ({
    request,
  }) => {
    const user = await fetchSessionUser(request);
    expect(user.clientIds, 'ENGINEER 에게 소속이 생기면 이 테스트의 전제가 깨집니다.').toEqual([]);

    const listResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      '/api/clients?pageSize=100'
    );
    expect(
      listResponse.status(),
      `ENGINEER 가 고객사 목록을 조회하지 못했습니다(내부 사용자 과잉 차단). ` +
        `응답: ${await listResponse.text()}`
    ).toBe(200);

    const clients = ((await listResponse.json()) as Paginated<ClientListItem>).data ?? [];
    const byCode = new Map(clients.map((client) => [client.code, client]));
    expect(
      [...byCode.keys()],
      `시드 고객사가 보이지 않습니다. prisma/seed.ts 를 실행하세요.`
    ).toEqual(expect.arrayContaining([CLIENT_CODE_A, CLIENT_CODE_B]));

    // 목록은 스코프 결과일 수 있으니 상세까지 확인한다. canReadClient 의
    // `canViewAll && isInternalUser(user)` 분기가 사라지면 여기서 403 이 된다.
    const clientB = byCode.get(CLIENT_CODE_B)!;
    const detailResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/clients/${clientB.id}`
    );
    expect(
      detailResponse.status(),
      `ENGINEER 가 비소속 고객사(${CLIENT_CODE_B}) 상세를 조회하지 못했습니다. ` +
        `응답: ${await detailResponse.text()}`
    ).toBe(200);
    expect(((await detailResponse.json()) as ClientListItem).code).toBe(CLIENT_CODE_B);
  });

  test('ENGINEER 는 자신에게 배정된 SR 상세를 조회한다', async ({ request }) => {
    const user = await fetchSessionUser(request);
    const sr = await fetchSrDetail(request, srForRead.id);

    expect(sr.id).toBe(srForRead.id);
    expect(sr.srNumber).toBe(srForRead.srNumber);
    // 200 의 근거가 "배정" 임을 고정한다. 담당자가 다른 사람이면 canReadSR 의
    // ENGINEER 분기(sr.assigneeId === user.id)가 아니라 다른 경로로 통과한 것이다.
    expect(
      sr.assigneeId,
      'seedSR 이 ENGINEER 페르소나를 담당자로 지정하지 않았습니다. 이 양성 대조가 성립하지 않습니다.'
    ).toBe(user.id);
    expect(sr.status).toBe('INTAKE');
  });

  /**
   * 회귀 가드 — 목록과 상세가 어긋나 있었다.
   *
   * canReadSR 은 ENGINEER 에게 `sr.assigneeId === user.id` 만 허용한다
   * ("비즈니스 헌법 제1조 격리 원칙", src/lib/policies.ts). 그런데 목록 경로는
   * resolveClientIdFilter 만 거쳤고 그 함수는 내부 사용자를 그대로 통과시켰다.
   *
   * 실측(수정 전): GET /api/srs 가 미배정 SR-2024-003 까지 3건을 돌려줬고,
   * 그 3건의 상세는 전부 403 이었다. 목록에서 보이는 행을 클릭하면 접근 거부가 되는
   * 구조였고, 그 자체가 **제목과 고객사명의 노출**이다.
   *
   * 이제 목록에도 같은 담당자 스코프가 걸린다(policies.ts 의 resolveAssigneeScope).
   * "목록에 있는 모든 행은 열 수 있다" 를 직접 단언한다 — 두 경로가 다시 갈라지면 깨진다.
   */
  test('목록에 보이는 SR 은 전부 상세도 열린다', async ({ request }) => {
    const response = await apiRequestWithRateLimitRetry(request, 'get', '/api/srs?pageSize=100');
    expect(response.status(), 'ENGINEER 가 SR 목록을 조회하지 못했습니다.').toBe(200);

    const rows = ((await response.json()) as Paginated<SrListItem>).data ?? [];
    expect(
      rows.length,
      '목록이 비어 있으면 이 검증이 공허해집니다. seedSR 이 만든 배정 SR 이 보여야 합니다.'
    ).toBeGreaterThan(0);

    const user = await fetchSessionUser(request);
    for (const row of rows) {
      const detail = await apiRequestWithRateLimitRetry(request, 'get', `/api/srs/${row.id}`);
      expect(
        detail.status(),
        `SR ${row.srNumber} 이 목록에는 보이는데 상세는 ${detail.status()} 입니다. ` +
          '목록 스코프와 canReadSR 이 어긋났습니다 — 제목·고객사명이 노출됩니다.'
      ).toBe(200);
      expect(
        ((await detail.json()) as { assigneeId: string | null }).assigneeId,
        `SR ${row.srNumber} 이 ENGINEER 에게 배정되지 않았는데 목록에 있습니다.`
      ).toBe(user.id);
    }
  });
});

test.describe('ENGINEER: 배정된 SR 의 상태 전이 (본업)', () => {
  test('배정된 SR 을 진행 시작하고 완료 처리한다', async ({ request }) => {
    const startResponse = await apiRequestWithRateLimitRetry(
      request,
      'patch',
      `/api/srs/${srForTransition.id}/status`,
      { data: { action: 'start' } }
    );
    expect(
      startResponse.status(),
      `ENGINEER 가 자신에게 배정된 SR(${srForTransition.srNumber})을 진행 시작하지 못했습니다. ` +
        `canUpdateSR 의 ENGINEER 분기 또는 SR:STATUS_CHANGE 권한이 사라졌습니다. ` +
        `응답: ${await startResponse.text()}`
    ).toBe(200);

    // 상태 코드만으로는 "200 인데 아무것도 안 바뀌었다"를 잡지 못한다.
    expect((await fetchSrDetail(request, srForTransition.id)).status).toBe('IN_PROGRESS');

    const completeResponse = await apiRequestWithRateLimitRetry(
      request,
      'patch',
      `/api/srs/${srForTransition.id}/status`,
      { data: { action: 'complete', resolutionDescription: 'E2E: 담당 엔지니어가 완료 처리' } }
    );
    expect(
      completeResponse.status(),
      `ENGINEER 가 자신의 SR 을 완료 처리하지 못했습니다. 응답: ${await completeResponse.text()}`
    ).toBe(200);

    expect((await fetchSrDetail(request, srForTransition.id)).status).toBe('COMPLETED');
  });

  test('완료된 자기 SR 이라도 확인 완료(confirm)는 신청자만 가능하다', async ({ request }) => {
    // 담당자여도 신청자가 아니면 막힌다 — src/app/api/srs/[id]/status/route.ts 의
    // confirm 분기(currentSR.requesterId !== session.user.id → 403).
    const user = await fetchSessionUser(request);
    const before = await fetchSrDetail(request, srForConfirm.id);
    expect(before.status, '전제: 이 SR 은 COMPLETED 여야 합니다.').toBe('COMPLETED');
    expect(before.assigneeId, '전제: 이 SR 의 담당자는 ENGINEER 본인이어야 합니다.').toBe(user.id);
    expect(
      before.requesterId,
      '전제: 신청자가 ENGINEER 본인이면 이 음성 검증이 성립하지 않습니다.'
    ).not.toBe(user.id);

    const response = await apiRequestWithRateLimitRetry(
      request,
      'patch',
      `/api/srs/${srForConfirm.id}/status`,
      { data: { action: 'confirm' } }
    );
    expect(
      response.status(),
      `ENGINEER 가 신청자가 아닌 SR 을 확인 완료 처리했습니다. 응답: ${await response.text()}`
    ).toBe(403);

    // 403 을 주고도 상태는 바뀌는 경우를 배제한다.
    expect((await fetchSrDetail(request, srForConfirm.id)).status).toBe('COMPLETED');
  });

  test('배정된 SR 이라도 삭제는 차단된다', async ({ request }) => {
    // 시드 ENGINEER 권한 집합에 SR:DELETE 가 없다(실측 세션 permissions).
    // canDeleteSR 은 ADMIN 이 아니면 SR:DELETE 플래그를 먼저 요구한다.
    const response = await apiRequestWithRateLimitRetry(
      request,
      'delete',
      `/api/srs/${srForDelete.id}`
    );
    expect(
      response.status(),
      `ENGINEER 가 SR 을 삭제했습니다. src/lib/policies.ts 의 canDeleteSR 이 ` +
        `SR:DELETE 플래그를 요구하지 않고 있습니다. 응답: ${await response.text()}`
    ).toBe(403);

    // 삭제가 실제로 일어나지 않았는지 서버 상태로 확인한다.
    expect((await fetchSrDetail(request, srForDelete.id)).id).toBe(srForDelete.id);
  });
});

test.describe('ENGINEER: 관리 카탈로그 차단 (음성)', () => {
  // 실측(2026-08-09) 및 prisma/seed.ts 의 ENGINEER 권한 집합:
  // SR / COMMENT / ATTACHMENT / CLIENT:READ / DASHBOARD / NOTIFICATION / USER:UPDATE_SELF.
  // USER:READ 도 ROLE:* 도 없다.
  const blockedEndpoints: Array<{ path: string; guard: string }> = [
    {
      path: '/api/users',
      guard: 'src/app/api/users/route.ts 의 ensureCanReadUser (ADMIN 또는 USER:READ)',
    },
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
    test(`ENGINEER 는 ADMIN 이 아니다: GET ${endpoint.path} 는 403 이다`, async ({ request }) => {
      const response = await apiRequestWithRateLimitRetry(request, 'get', endpoint.path);

      expect(
        response.status(),
        `ENGINEER 가 관리 카탈로그(${endpoint.path})에 접근했습니다. ` +
          `가드: ${endpoint.guard}. 응답: ${await response.text()}`
      ).toBe(403);
    });
  }
});

/**
 * 여기서부터가 이 파일이 드러내는 **UI/API 불일치**다.
 *
 * src/config/navigation.ts 는 '조직 관리'·'권한 관리' 를 roles: ['ADMIN','MANAGER','ENGINEER']
 * 로 열어 둔다. 그런데 그 메뉴가 데려가는 화면이 부르는 API 는 ENGINEER 에게 403 이다
 * (위 음성 테스트가 그것을 고정한다). 즉 ENGINEER 는 눌러서 도달할 수는 있지만
 * 데이터는 못 받는다.
 *
 * 아래 두 테스트는 "그래서 화면에 무엇이 보이는가"를 **관측된 사실 그대로** 고정한다.
 * 실측 결과 화면은 에러도 권한 안내도 아니고 **정상적인 빈 목록**이다.
 * 그것이 바람직한 동작이라는 뜻이 아니라, 지금 강제되는 동작이 그렇다는 뜻이다.
 * 기대 동작은 test.fixme 로 따로 적어 둔다.
 */
test.describe('ENGINEER: 네비게이션 계약과 그 화면의 실제 모습', () => {
  /**
   * 메뉴는 이제 **하위 항목의 permission** 으로 판정된다(src/config/navigation.ts).
   *
   * 예전에는 상위·하위 모두 `roles: ['ADMIN','MANAGER','ENGINEER']` 였고, 그래서
   * ENGINEER 에게 '권한 관리' 가 보이는데 그 화면의 GET /api/roles 는 403 이었다.
   * 눌러도 아무 데도 갈 수 없는 메뉴였다.
   *
   * 지금 계약:
   *  - 상위 roles 는 **내부/외부 경계**만 본다 (CLIENT_ADMIN 도 USER:READ·CLIENT:READ 를
   *    갖지만 내부 운영 메뉴에 들어와서는 안 되므로 권한만으로는 게이트할 수 없다).
   *  - 하위는 permission 으로 판정한다. 하위가 전부 막히면 상위도 자동으로 감춰진다.
   * ENGINEER 기준 실측: CLIENT:READ 있음 / USER:READ 없음 / ROLE:READ 없음.
   */
  test('실제로 쓸 수 있는 메뉴만 보인다', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const nav = mainNav(page);
    await expect(nav).toBeVisible();
    const labels = (await nav.getByRole('link').allInnerTexts())
      .map((text) => text.trim())
      .filter(Boolean);

    // '조직 관리' 는 남는다 — 하위의 조직 구조·고객사 목록이 CLIENT:READ 로 실제 동작한다.
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'SR 관리', '조직 관리']));

    // '권한 관리' 는 사라진다 — 하위가 '역할 관리'(ROLE:READ) 하나뿐이고 ENGINEER 에게 없다.
    expect(
      labels,
      'ENGINEER 에게 권한 관리 메뉴가 보입니다. 눌러도 403 이라 막다른 길입니다.'
    ).not.toContain('권한 관리');

    // 메뉴가 존재하는 것과 실제로 데려다주는 것은 다른 문제다.
    await nav.getByRole('link', { name: '조직 관리' }).click();
    await expect(page).toHaveURL(/\/organization/);
  });

  test('사용자 목록 화면은 403 을 "권한 없음" 으로 알린다', async ({ page }) => {
    const usersResponse = page.waitForResponse(
      (response) => response.url().includes('/api/users') && response.request().method() === 'GET',
      { timeout: 20000 }
    );
    await page.goto('/users', { waitUntil: 'domcontentloaded' });

    // (1) 서버는 막는다 — 데이터가 새지는 않는다.
    expect(
      (await usersResponse).status(),
      'ENGINEER 에게 /api/users 가 열렸습니다. 위 음성 테스트와 함께 깨진 것입니다.'
    ).toBe(403);

    // (2) 화면은 "권한이 없다" 고 말해야 한다.
    //     예전에는 빈 목록('등록된 사용자가 없습니다.')으로 위장했고, 그러면 사용자는
    //     "권한 없음" 과 "데이터 없음" 을 구분할 수 없다.
    await expect(page.getByRole('heading', { name: '사용자 목록', exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText('사용자 목록을 볼 권한이 없습니다.')).toBeVisible();
    await expect(
      page.getByText(/등록된 사용자가 없습니다/),
      '권한 없음 화면에서 빈 목록 문구가 함께 보입니다 — 두 상태가 다시 섞였습니다.'
    ).toHaveCount(0);

    // (3) 사용자 데이터는 한 줄도 그려지면 안 된다 — 403 인데 목록이 채워지면 그게 유출이다.
    await expect(page.getByText(ENGINEER_EMAIL, { exact: true })).toHaveCount(0);
    await expect(page.getByText('admin@example.com', { exact: true })).toHaveCount(0);
  });

  test('역할 목록 화면은 403 을 "권한 없음" 으로 알린다', async ({ page }) => {
    const rolesResponse = page.waitForResponse(
      (response) => response.url().includes('/api/roles') && response.request().method() === 'GET',
      { timeout: 20000 }
    );
    await page.goto('/roles', { waitUntil: 'domcontentloaded' });

    expect((await rolesResponse).status(), 'ENGINEER 에게 /api/roles 가 열렸습니다.').toBe(403);

    await expect(page.getByRole('heading', { name: '역할 목록', exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText('역할 목록을 볼 권한이 없습니다.')).toBeVisible();
    await expect(page.getByText(/등록된 역할이 없습니다/)).toHaveCount(0);
  });

  test('권한 없는 화면에는 등록 버튼도 보이지 않는다', async ({ page }) => {
    // 서버가 POST 를 403 으로 막으므로 데이터가 새지는 않았지만, 누르면 반드시 실패하는
    // 버튼을 보여 주는 것은 결함이다. 서버와 같은 규칙(USER:CREATE)으로 감춘다.
    await page.goto('/users', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '사용자 목록', exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole('button', { name: '사용자 등록' })).toHaveCount(0);
  });
});
