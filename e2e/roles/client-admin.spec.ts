import { APIRequestContext, BrowserContext, expect, test } from '@playwright/test';

import { PERSONA_AUTH_FILES } from '../helpers/auth-helpers';
import { apiRequestWithRateLimitRetry } from '../helpers/test-helpers';

/**
 * CLIENT_ADMIN 테넌트 경계 행동 스펙.
 *
 * 감사에서 치명적으로 지적된 두 구멍이 이 파일의 대상이다.
 *  - 3.6 canReadClient 가 CLIENT:READ 플래그만 보고 타 고객사 상세를 내주던 문제
 *  - 3.7 canUpdateUser 에 테넌트 조건이 없어 CLIENT_ADMIN 이 자신의 clientIds 에
 *        다른 고객사를 추가(자가 승격)할 수 있던 문제
 *
 * 두 구멍 모두 src/lib/policies.ts 와 src/app/api/users/[id]/route.ts 에서 막혔지만
 * 지금까지 CLIENT_ADMIN 을 실제로 태워 보는 E2E 는 하나도 없었다.
 *
 * 설계 원칙:
 *  - 보안 속성은 픽셀이 아니라 API 응답과 "요청 이후 서버에 남은 상태"로 단언한다.
 *  - 음성 테스트만 있으면 전부 깨진 상태에서도 초록이 되므로 양성 대조를 먼저 둔다.
 *  - 타 테넌트(TEST002)에 실제 SR 픽스처를 만들어 두어야 "타 테넌트 SR 이 안 보인다"가
 *    공허한 참(vacuous truth)이 되지 않는다. 픽스처 생성은 내부 사용자인 MANAGER 로 한다.
 */

test.use({ storageState: PERSONA_AUTH_FILES.clientAdmin });

// 하나의 타 테넌트 픽스처를 여러 테스트가 공유하므로 순차 실행으로 고정한다.
test.describe.configure({ mode: 'serial' });

const CLIENT_ADMIN_EMAIL = process.env.TEST_CLIENT_ADMIN_EMAIL || 'clientadminuser@example.com';
const CLIENT_USER_EMAIL = process.env.TEST_CLIENT_EMAIL || 'clientuser@example.com';

/** CLIENT_ADMIN 이 소속된 고객사 (prisma/seed.ts) */
const OWN_CLIENT_CODE = 'TEST001';
/** CLIENT_ADMIN 이 소속되지 않은 "다른 테넌트" */
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
  categoryName: string;
}

interface SrListItem {
  id: string;
  srNumber: string;
  clientId: string;
}

interface UserDetail {
  id: string;
  email: string;
  clients?: Array<{ clientId: string }>;
}

async function fetchSessionUser(request: APIRequestContext): Promise<SessionUser> {
  const response = await request.get('/api/auth/session');
  expect(response.status(), 'GET /api/auth/session 이 200 이어야 합니다.').toBe(200);

  const body = (await response.json()) as { user?: Partial<SessionUser> };
  expect(
    body.user,
    'CLIENT_ADMIN 세션이 비어 있습니다. role-persona-setup 을 먼저 확인하세요.'
  ).toBeTruthy();

  return {
    id: body.user!.id ?? '',
    email: body.user!.email ?? '',
    roles: body.user!.roles ?? [],
    clientIds: body.user!.clientIds ?? [],
  };
}

/** 사용자 상세에서 소속 고객사 ID 목록만 추린다 (정렬해 비교 안정성 확보) */
function membershipIds(user: UserDetail): string[] {
  return (user.clients ?? []).map((membership) => membership.clientId).sort();
}

async function fetchUserDetail(
  request: APIRequestContext,
  userId: string,
  who: string
): Promise<UserDetail> {
  const response = await apiRequestWithRateLimitRetry(request, 'get', `/api/users/${userId}`);
  expect(
    response.status(),
    `${who} 로 GET /api/users/${userId} 가 200 이어야 합니다. 응답: ${await response.text()}`
  ).toBe(200);
  return (await response.json()) as UserDetail;
}

test.describe('CLIENT_ADMIN 테넌트 경계', () => {
  let managerContext: BrowserContext;
  let managerRequest: APIRequestContext;

  let selfUserId: string;
  let ownClientId: string;
  let otherClientId: string;
  /** TEST002(타 테넌트)에 실재하는 SR. 음성 테스트가 공허해지지 않도록 반드시 존재시킨다. */
  let otherTenantSrId: string;
  let otherTenantSrNumber: string;
  /**
   * 이 스펙이 **직접 만든** 경우에만 true. 기존 SR 을 재사용했다면 지우면 안 된다 —
   * 남의 데이터를 치우는 것이 되고, 다음 실행의 전제를 오히려 무너뜨린다.
   */
  let createdOtherTenantSr = false;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);

    // --- 1) CLIENT_ADMIN 세션에서 본인 식별자와 소속 확보 ---
    const clientAdminContext = await browser.newContext({
      storageState: PERSONA_AUTH_FILES.clientAdmin,
    });
    try {
      const user = await fetchSessionUser(clientAdminContext.request);

      expect(user.email, 'client-admin 페르소나가 다른 계정입니다.').toBe(CLIENT_ADMIN_EMAIL);
      expect(
        [...user.roles].sort(),
        'CLIENT_ADMIN 페르소나는 CLIENT_ADMIN 역할만 가져야 합니다.'
      ).toEqual(['CLIENT_ADMIN']);
      expect(
        user.clientIds.length,
        'CLIENT_ADMIN 은 정확히 한 고객사(TEST001)에만 소속되어야 합니다 (prisma/seed.ts 계약).'
      ).toBe(1);

      selfUserId = user.id;
      ownClientId = user.clientIds[0]!;
      expect(selfUserId, 'CLIENT_ADMIN 세션에서 사용자 ID를 얻지 못했습니다.').toBeTruthy();
    } finally {
      await clientAdminContext.close();
    }

    // --- 2) 내부 사용자(MANAGER)로 타 테넌트 식별자와 SR 픽스처 준비 ---
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

    const clientsBody = (await clientsResponse.json()) as Paginated<ClientListItem>;
    const byCode = new Map((clientsBody.data ?? []).map((client) => [client.code, client]));

    for (const code of [OWN_CLIENT_CODE, OTHER_CLIENT_CODE]) {
      expect(
        byCode.has(code),
        `시드 고객사 ${code} 가 없어 테넌트 경계를 검증할 수 없습니다. prisma/seed.ts 를 실행하세요.`
      ).toBeTruthy();
    }

    otherClientId = byCode.get(OTHER_CLIENT_CODE)!.id;

    // 시드 계약 확인: CLIENT_ADMIN 의 소속은 TEST001 이고 TEST002 는 아니어야 한다.
    expect(
      ownClientId,
      `CLIENT_ADMIN 의 소속이 ${OWN_CLIENT_CODE} 가 아닙니다. 시드 계약이 깨졌습니다.`
    ).toBe(byCode.get(OWN_CLIENT_CODE)!.id);
    expect(
      ownClientId,
      `CLIENT_ADMIN 이 ${OTHER_CLIENT_CODE} 에도 소속되면 이 스펙의 "다른 테넌트"가 사라집니다.`
    ).not.toBe(otherClientId);

    // 타 테넌트에 SR 이 이미 있으면 재사용하고, 없으면 MANAGER 권한으로 하나 만든다.
    const otherSrsResponse = await apiRequestWithRateLimitRetry(
      managerRequest,
      'get',
      `/api/srs?clientId=${otherClientId}&pageSize=1`
    );
    expect(
      otherSrsResponse.status(),
      `MANAGER 로 ${OTHER_CLIENT_CODE} SR 목록 조회 실패. 응답: ${await otherSrsResponse.text()}`
    ).toBe(200);
    const existingOtherSrs = ((await otherSrsResponse.json()) as Paginated<SrListItem>).data ?? [];

    if (existingOtherSrs.length > 0) {
      otherTenantSrId = existingOtherSrs[0]!.id;
      otherTenantSrNumber = existingOtherSrs[0]!.srNumber;
    } else {
      const categoriesResponse = await apiRequestWithRateLimitRetry(
        managerRequest,
        'get',
        `/api/clients/${otherClientId}/categories`
      );
      expect(
        categoriesResponse.status(),
        `MANAGER 로 ${OTHER_CLIENT_CODE} 서비스 카테고리 조회 실패. 응답: ${await categoriesResponse.text()}`
      ).toBe(200);

      const categories = (await categoriesResponse.json()) as ServiceCategoryItem[];
      expect(
        categories.length,
        `${OTHER_CLIENT_CODE} 의 서비스 카테고리가 없어 타 테넌트 SR 픽스처를 만들 수 없습니다.`
      ).toBeGreaterThan(0);

      const createResponse = await apiRequestWithRateLimitRetry(
        managerRequest,
        'post',
        '/api/srs',
        {
          data: {
            title: `타 테넌트 격리 검증용 SR ${Date.now()}`,
            description: 'CLIENT_ADMIN 테넌트 경계 검증을 위해 MANAGER 가 생성한 SR 입니다.',
            clientId: otherClientId,
            serviceCategoryId: categories[0]!.id,
            requestedPriority: 'MEDIUM',
          },
        }
      );
      expect(
        createResponse.status(),
        `타 테넌트 SR 픽스처 생성 실패. 응답: ${await createResponse.text()}`
      ).toBe(201);

      const createdSr = (await createResponse.json()) as SrListItem;
      otherTenantSrId = createdSr.id;
      otherTenantSrNumber = createdSr.srNumber;
      createdOtherTenantSr = true;
    }

    expect(otherTenantSrId, '타 테넌트 SR 픽스처를 확보하지 못했습니다.').toBeTruthy();
  });

  test.afterAll(async () => {
    // 정리가 없던 동안 '타 테넌트 격리 검증용 SR' 이 매 실행 쌓였다. 다음 실행은 그것을
    // 재사용하므로 증상이 드러나지 않았을 뿐, TEST002 의 SR 이 계속 늘고 있었다.
    if (managerContext && createdOtherTenantSr && otherTenantSrId) {
      const response = await managerRequest.delete(`/api/srs/${otherTenantSrId}`);
      if (!response.ok()) {
        console.warn(`타 테넌트 SR 정리 실패: ${otherTenantSrId} → ${response.status()}`);
      }
    }
    if (managerContext) {
      await managerContext.close();
    }
  });

  test('양성 대조: 자사 고객사 상세와 자사 사용자/SR 은 정상 조회된다', async ({ request }) => {
    // 이 대조군이 없으면 "전부 403" 인 고장 상태에서도 아래 음성 테스트들이 통과해 버린다.
    const clientResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/clients/${ownClientId}`
    );
    expect(
      clientResponse.status(),
      `CLIENT_ADMIN 이 자사(${OWN_CLIENT_CODE}) 상세를 조회하지 못했습니다(과잉 차단). ` +
        `응답: ${await clientResponse.text()}`
    ).toBe(200);
    expect(((await clientResponse.json()) as ClientListItem).code).toBe(OWN_CLIENT_CODE);

    // 자사 사용자 로스터
    const usersResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      '/api/users?pageSize=100'
    );
    expect(
      usersResponse.status(),
      `CLIENT_ADMIN 이 사용자 목록을 조회하지 못했습니다. 응답: ${await usersResponse.text()}`
    ).toBe(200);

    const users = ((await usersResponse.json()) as Paginated<UserDetail>).data ?? [];

    // 스코프 확인: 반환된 모든 사용자는 자사 소속이어야 한다.
    // (내부 사용자는 소속이 없으므로, 스코프가 풀리면 여기서 즉시 잡힌다.)
    expect(users.length, '사용자 목록이 비어 있으면 스코프 검증이 공허해집니다.').toBeGreaterThan(
      0
    );
    for (const user of users) {
      expect(
        membershipIds(user).includes(ownClientId),
        `사용자 ${user.email} 은 자사(${OWN_CLIENT_CODE}) 소속이 아닌데 목록에 포함되었습니다.`
      ).toBeTruthy();
    }

    // 같은 고객사 구성원이 실제로 보이는지 (페이지 1 의존을 피하려고 search 로 특정한다)
    for (const email of [CLIENT_ADMIN_EMAIL, CLIENT_USER_EMAIL]) {
      const searchResponse = await apiRequestWithRateLimitRetry(
        request,
        'get',
        `/api/users?search=${encodeURIComponent(email)}`
      );
      expect(searchResponse.status()).toBe(200);
      const found = ((await searchResponse.json()) as Paginated<UserDetail>).data ?? [];
      expect(
        found.map((user) => user.email),
        `자사(${OWN_CLIENT_CODE}) 구성원 ${email} 이 사용자 목록에 보이지 않습니다.`
      ).toContain(email);
    }

    // 자사 SR
    const srsResponse = await apiRequestWithRateLimitRetry(request, 'get', '/api/srs?pageSize=100');
    expect(
      srsResponse.status(),
      `CLIENT_ADMIN 이 SR 목록을 조회하지 못했습니다. 응답: ${await srsResponse.text()}`
    ).toBe(200);
    const srs = ((await srsResponse.json()) as Paginated<SrListItem>).data ?? [];
    expect(
      srs.length,
      `CLIENT_ADMIN 이 자사(${OWN_CLIENT_CODE}) SR 을 하나도 보지 못했습니다. ` +
        '시드 SR 이 없거나 정책이 과잉 차단 중입니다.'
    ).toBeGreaterThan(0);
  });

  test('자사 상세의 서비스 카테고리에 타 고객사 것이 섞이지 않는다', async ({ request }) => {
    // ── 실제로 새고 있었다 ──────────────────────────────────────────────
    // client.service.getClientWithDetailsAndCategories 가 관계로 이미 스코프된
    // serviceCategories 를 getActiveCategories()(clientId 필터 없음, client 관계
    // include)의 결과로 덮어썼다. 자사 상세를 여는 것만으로 타 고객사의
    // 카테고리명·고객사명·코드가 응답에 실려 나갔다.
    // 실측: CLIENT_ADMIN/TEST001 이 5건을 받았고 그중 2건이 TEST002 의 것이었다.
    //
    // 403 만 단언하는 음성 테스트로는 이런 유출을 못 잡는다 — 응답 코드는 200 이고
    // 요청도 자사 것이기 때문이다. 본문의 소속을 봐야 한다.
    const response = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/clients/${ownClientId}`
    );
    expect(response.status()).toBe(200);

    const detail = (await response.json()) as {
      serviceCategories?: Array<{ id: string; categoryName: string; clientId: string | null }>;
    };
    const categories = detail.serviceCategories ?? [];

    // 시드가 자사에 카테고리를 넣는다. 0건이면 이 검증이 공허해진다.
    expect(
      categories.length,
      '자사 서비스 카테고리가 0건이라 스코프 검증이 공허합니다. 시드를 확인하세요.'
    ).toBeGreaterThan(0);

    const foreign = categories.filter((category) => category.clientId !== ownClientId);
    expect(
      foreign.map((category) => `${category.categoryName}(${category.clientId})`),
      `자사(${OWN_CLIENT_CODE}) 상세에 타 고객사 서비스 카테고리가 포함되었습니다.`
    ).toEqual([]);
  });

  test('타 고객사 상세 조회는 403 으로 차단된다 (감사 3.6)', async ({ request }) => {
    const detailResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/clients/${otherClientId}`
    );
    expect(
      detailResponse.status(),
      `CLIENT_ADMIN 이 타 고객사(${OTHER_CLIENT_CODE}) 상세를 조회했습니다. ` +
        'src/lib/policies.ts 의 canReadClient 테넌트 조건이 사라졌습니다. ' +
        `응답: ${await detailResponse.text()}`
    ).toBe(403);

    // 같은 정책을 쓰는 두 번째 표면: 고객사 서비스 카테고리
    const categoriesResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/clients/${otherClientId}/categories`
    );
    expect(
      categoriesResponse.status(),
      `CLIENT_ADMIN 이 타 고객사(${OTHER_CLIENT_CODE}) 서비스 카테고리를 조회했습니다. ` +
        `응답: ${await categoriesResponse.text()}`
    ).toBe(403);

    // 목록 경로에도 타 고객사가 섞이면 안 된다.
    const listResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      '/api/clients?pageSize=100'
    );
    expect(listResponse.status()).toBe(200);
    const clients = ((await listResponse.json()) as Paginated<ClientListItem>).data ?? [];
    expect(
      clients.map((client) => client.code),
      `고객사 목록에 타 테넌트(${OTHER_CLIENT_CODE})가 노출되었습니다.`
    ).not.toContain(OTHER_CLIENT_CODE);
  });

  test('자기 clientIds 에 타 테넌트를 추가하는 자가 승격은 반영되지 않는다 (감사 3.7)', async ({
    request,
  }) => {
    const before = await fetchUserDetail(request, selfUserId, 'CLIENT_ADMIN');
    expect(membershipIds(before), '검증 시작 시점의 소속이 자사 하나가 아닙니다.').toEqual([
      ownClientId,
    ]);

    const patchResponse = await apiRequestWithRateLimitRetry(
      request,
      'patch',
      `/api/users/${selfUserId}`,
      { data: { clientIds: [ownClientId, otherClientId] } }
    );

    // 외부 사용자가 소속을 "바꾸려" 하면 서버가 403 으로 거부한다.
    // 조용히 필드만 버리고 200 을 주면 호출자는 변경에 성공한 줄 알게 되므로,
    // 상태 코드 자체가 통제의 일부다. (소속을 그대로 다시 보내는 경우는 no-op 으로 허용)
    expect(
      patchResponse.status(),
      `자가 승격 PATCH 는 403 으로 거부되어야 합니다. 응답: ${await patchResponse.text()}`
    ).toBe(403);

    // 상태 코드가 아니라 서버에 남은 상태로 판정한다 ("403 인데 쓰기는 됐다"를 잡기 위함).
    const afterSelfRead = await fetchUserDetail(request, selfUserId, 'CLIENT_ADMIN');
    expect(
      membershipIds(afterSelfRead),
      `CLIENT_ADMIN 이 자신의 소속에 타 테넌트(${OTHER_CLIENT_CODE})를 추가했습니다. ` +
        'src/app/api/users/[id]/route.ts 의 clientIds 제거 로직 또는 policies.ts 의 canUpdateUser 테넌트 조건이 사라졌습니다.'
    ).toEqual([ownClientId]);

    // 자기 자신이 읽는 경로가 조작될 가능성까지 배제하기 위해 내부 사용자(MANAGER)로 독립 확인한다.
    const afterManagerRead = await fetchUserDetail(managerRequest, selfUserId, 'MANAGER');
    expect(
      membershipIds(afterManagerRead),
      'MANAGER 시점에서 본 CLIENT_ADMIN 의 소속이 자사 하나가 아닙니다.'
    ).toEqual([ownClientId]);

    // 승격 시도 이후에도 타 고객사 상세는 여전히 막혀 있어야 한다.
    const afterDetailResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/clients/${otherClientId}`
    );
    expect(afterDetailResponse.status(), '자가 승격 시도 후 타 고객사 상세가 열렸습니다.').toBe(
      403
    );
  });

  test('SR 목록과 상세는 타 테넌트 SR 을 노출하지 않는다', async ({ request }) => {
    const listResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      '/api/srs?pageSize=100'
    );
    expect(listResponse.status()).toBe(200);

    const srs = ((await listResponse.json()) as Paginated<SrListItem>).data ?? [];
    expect(srs.length, 'SR 목록이 비어 있으면 격리 검증이 공허해집니다.').toBeGreaterThan(0);

    for (const sr of srs) {
      expect(
        sr.clientId,
        `SR ${sr.srNumber} 이 자사(${OWN_CLIENT_CODE})가 아닌 고객사 소속인데 목록에 노출되었습니다.`
      ).toBe(ownClientId);
    }
    expect(
      srs.map((sr) => sr.id),
      `타 테넌트 SR(${otherTenantSrNumber})이 CLIENT_ADMIN 목록에 노출되었습니다.`
    ).not.toContain(otherTenantSrId);

    // clientId 파라미터로 타 테넌트를 직접 지목해도 결과는 비어 있어야 한다.
    const scopedResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/srs?clientId=${otherClientId}&pageSize=100`
    );
    expect(scopedResponse.status()).toBe(200);
    const scopedBody = (await scopedResponse.json()) as Paginated<SrListItem>;
    expect(
      scopedBody.data ?? [],
      `clientId=${OTHER_CLIENT_CODE} 를 직접 지정하자 타 테넌트 SR 이 반환되었습니다.`
    ).toEqual([]);
    expect(scopedBody.meta?.totalItems ?? 0).toBe(0);

    // 상세 접근: SR 이 실재하므로 404 가 아니라 403 이어야 한다.
    // (404 가 나오면 픽스처가 사라진 것이고, 200 이면 canReadSR 의 소속 조건이 깨진 것이다.)
    const detailResponse = await apiRequestWithRateLimitRetry(
      request,
      'get',
      `/api/srs/${otherTenantSrId}`
    );
    expect(
      detailResponse.status(),
      `CLIENT_ADMIN 이 타 테넌트 SR(${otherTenantSrNumber}) 상세에 접근했습니다. ` +
        `응답: ${await detailResponse.text()}`
    ).toBe(403);
  });
});
