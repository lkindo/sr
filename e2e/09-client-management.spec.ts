import { expect, test } from '@playwright/test';

import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';

/**
 * 고객사 관리 — ADMIN 의 CRUD 와 CLIENT_USER 의 경계.
 *
 * ── 이 파일이 하던 위험한 일 ──────────────────────────────────────────────
 * '고객사 수정 플로우' 는 **목록의 첫 번째 행**을 열어 이름을 `Updated Client <timestamp>` 로
 * 덮어썼다. 그 첫 행은 자기가 만든 고객사가 아니라 시드 고객사(TEST001/TEST002)였다.
 * '고객사 비활성화 플로우' 도 E2E 고객사를 못 찾으면 첫 행을 비활성화하려 들었다.
 * 공유 DB 에서 다른 스펙이 그 소속을 계약으로 단언한다 — e2e/roles/client-admin.spec.ts 의
 * "CLIENT_ADMIN 의 소속은 TEST001" 이 그렇다.
 *
 * 이제 모든 쓰기는 **이 스펙이 직접 만든 고객사**만 대상으로 하고 afterAll 에서 지운다.
 *
 * '고객사 목록 페이지 접근' 은 00-smoke.spec.ts 로 옮겼다.
 *
 * ⚠️ networkidle 금지 — 인증된 페이지는 /api/realtime SSE 를 계속 열어 둔다.
 */

/**
 * 테스트가 만든 고객사를 완전히 지운다.
 *
 * 그냥 DELETE 하면 반드시 409 다. createClient 가 기본 서비스 분류를 하나 함께 만들기 때문이다
 * (client.service.ts:188 — "SR 은 serviceCategoryId 가 필수라 카테고리가 0개인 고객사는" 주석 참고).
 * 그래서 분류를 먼저 지운다.
 *
 * 이 정리가 없던 동안 E2E 고객사가 계속 쌓였다. 삭제는 409 로 막히고, 앱이 안내하는 대안인
 * '비활성화' 는 동작하지 않는다(아래 test.fixme 참고). 즉 지울 방법이 아예 없었다.
 */
async function purgeClient(api: import('@playwright/test').APIRequestContext, clientId: string) {
  const categories = await api.get(`/api/clients/${clientId}/categories`);
  if (categories.ok()) {
    const list = (await categories.json()) as Array<{ id: string }>;
    for (const category of list) {
      const removed = await api.delete(`/api/clients/${clientId}/categories/${category.id}`);
      if (!removed.ok()) {
        console.warn(`분류 정리 실패: ${category.id} → ${removed.status()}`);
      }
    }
  }

  const response = await api.delete(`/api/clients/${clientId}`);
  if (!response.ok()) {
    console.warn(`고객사 정리 실패: DELETE /api/clients/${clientId} → ${response.status()}`);
  }
}

test.describe('고객사 관리 - ADMIN 권한', () => {
  test.use({ storageState: PERSONA_AUTH_FILES.admin });
  test.describe.configure({ mode: 'serial' });

  let testClientName: string;
  let testClientCode: string;
  let testClientId: string | undefined;

  test.afterAll(async ({ browser }) => {
    if (!testClientId) return;
    const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES.admin });
    try {
      await purgeClient(context.request, testClientId);
    } finally {
      await context.close();
    }
  });

  test('고객사 등록 버튼이 보여야 함', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: '등록' })).toBeVisible({ timeout: 20000 });
  });

  test('검색어를 넣으면 그 고객사만 남는다', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({
      timeout: 20000,
    });

    // 예전에는 'test' 를 넣고 500ms 기다린 뒤 아무것도 확인하지 않았다.
    // 시드에 반드시 있는 코드로 검색해 결과가 실제로 좁혀지는지 본다.
    const search = page.locator('input[type="search"], input[placeholder*="검색"]').first();
    await expect(search).toBeVisible({ timeout: 10000 });
    await search.fill('TEST001');

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(1, { timeout: 15000 });
    await expect(rows.first()).toContainText('TEST001');
  });

  test('고객사 생성 전체 플로우', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '등록' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const timestamp = Date.now();
    testClientName = `E2E Test Client ${timestamp}`;
    testClientCode = `E2E${timestamp.toString().slice(-6)}`;

    await dialog.getByLabel('고객사 코드 *').fill(testClientCode);
    await dialog.getByLabel('고객사명 *').fill(testClientName);

    // 고객사 생성은 REST 가 아니라 Server Action(createClientAction)이다.
    // 서버 액션은 `next-action` 헤더를 달고 **현재 페이지 URL** 로 POST 되므로
    // `/api/clients` 를 기다리면 영원히 오지 않는다(예전 테스트가 2초 sleep 으로
    // 넘어간 이유이기도 하다). 그 POST 를 정확히 겨냥한다.
    const actionResponse = page.waitForResponse(
      (resp) =>
        resp.request().method() === 'POST' && Boolean(resp.request().headers()['next-action']),
      { timeout: 20000 }
    );
    await dialog
      .locator('button')
      .filter({ hasText: /저장|등록|생성|Save|Create/i })
      .first()
      .click();

    const response = await actionResponse;
    expect(response.status(), `고객사 생성 서버 액션 실패: ${response.status()}`).toBe(200);

    // 서버 액션 응답은 RSC 스트림이라 본문에서 id 를 꺼내기 어렵다.
    // 생성 결과는 API 로 조회해 확정한다 — 이 조회 자체가 "정말 만들어졌는가" 의 단언이다.
    const lookup = await page.request.get(
      `/api/clients?search=${encodeURIComponent(testClientCode)}&pageSize=5`
    );
    expect(lookup.status()).toBe(200);
    const found =
      ((await lookup.json()) as { data?: Array<{ id: string; code: string }> }).data ?? [];
    const created = found.find((c) => c.code === testClientCode);
    expect(created, `생성한 고객사(${testClientCode})를 API 에서 찾지 못했습니다.`).toBeTruthy();
    testClientId = created!.id;

    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('tbody tr').filter({ hasText: testClientName })).toBeVisible({
      timeout: 20000,
    });
  });

  test('고객사 상세 페이지가 생성한 값을 그대로 보여 준다', async ({ page }) => {
    expect(testClientId, '앞선 생성 테스트에서 대상 고객사가 준비되어야 함').toBeTruthy();

    // 예전에는 첫 행을 클릭하고 "URL 에 /clients/ 가 있으면 로그" 로 끝났다.
    // 내가 만든 고객사로 직접 들어가 값까지 대조한다.
    await page.goto(`/clients/${testClientId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(testClientName).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(testClientCode).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '고객사 정보 수정' })).toBeVisible();
  });

  test('고객사 수정이 서버에 반영된다', async ({ page }) => {
    expect(testClientId, '앞선 생성 테스트에서 대상 고객사가 준비되어야 함').toBeTruthy();

    await page.goto(`/clients/${testClientId}`, { waitUntil: 'domcontentloaded' });

    // /수정/ 로 느슨하게 잡으면 서비스 분류마다 있는 '<분류명> 수정' 버튼까지 걸려
    // strict mode violation 이 난다(분류 관리 UI 가 추가된 뒤 실제로 8개에 걸렸다).
    const editButton = page.getByRole('button', { name: '고객사 정보 수정' });
    await expect(editButton).toBeVisible({ timeout: 20000 });
    await editButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const updatedName = `${testClientName} (수정됨)`;
    await dialog.getByLabel('고객사명 *').fill(updatedName);

    // 수정도 Server Action(updateClientAction)이다. 위 생성과 같은 이유로 next-action POST 를 본다.
    const actionResponse = page.waitForResponse(
      (resp) =>
        resp.request().method() === 'POST' && Boolean(resp.request().headers()['next-action']),
      { timeout: 20000 }
    );
    await dialog
      .locator('button')
      .filter({ hasText: /저장|수정|Save|Update/i })
      .first()
      .click();

    const response = await actionResponse;
    expect(response.status(), `고객사 수정 서버 액션 실패: ${response.status()}`).toBe(200);

    // 서버 액션이 200 이어도 실제로 반영됐는지는 별개다. 서버 상태를 다시 읽는다.
    const detail = await page.request.get(`/api/clients/${testClientId}`);
    expect(detail.status()).toBe(200);
    expect(((await detail.json()) as { name: string }).name).toBe(updatedName);

    testClientName = updatedName;
  });

  /**
   * 고객사 비활성화 회귀 가드.
   *
   * 이 테스트는 한동안 test.fixme 였다. 두 경로 모두 isActive 를 버리고 있었기 때문이다:
   *   1) Server Action — src/components/clients/ClientDialog.tsx:103 이
   *      `formData.append('isActive', String(isActive))` 로 값을 보내지만,
   *      src/actions/client.actions.ts:58-67 의 updateClientAction 이 만드는 `data` 객체에
   *      isActive 가 **없다**. 그래서 읽히지도 않고 그대로 버려진다.
   *   2) REST — src/lib/schemas.ts:136 의 clientUpdateSchema 는
   *      `clientCreateSchema.omit({ code: true }).partial()` 인데 clientCreateSchema 에
   *      isActive 가 없다. zod 는 모르는 키를 기본으로 **조용히 제거**하므로
   *      `PATCH /api/clients/{id} { isActive: false }` 는 200 을 주면서 아무 일도 하지 않는다.
   *      (실측: 200 응답 직후 GET 하면 isActive 는 여전히 true 다.)
   *
   * 이 결함이 오래 남은 이유: 예전 '고객사 비활성화 플로우' 테스트는 목록 행에서
   * 삭제/비활성 버튼을 찾다가 못 찾으면 `console.log('ℹ️ 삭제 버튼이 행 내부에 없음')` 으로
   * 통과했다. 애초에 존재하지 않는 UI 를 찾고 있었으니 진짜 결함에는 닿지도 못했다.
   *
   * 셋 다 고쳤다(clientCreateSchema 에 isActive 추가 / updateClientAction 이 FormData 의
   * 문자열을 boolean 으로 파싱 / client.service.ts 의 updateClient 매핑에 반영).
   * 이제 이 테스트가 그 수정의 회귀 가드다.
   */
  test('고객사 비활성화가 서버 상태를 바꾼다', async ({ page }) => {
    expect(testClientId, '앞선 생성 테스트에서 대상 고객사가 준비되어야 함').toBeTruthy();

    await page.goto(`/clients/${testClientId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '고객사 정보 수정' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await dialog.getByLabel('활성 상태').uncheck();

    const actionResponse = page.waitForResponse(
      (resp) =>
        resp.request().method() === 'POST' && Boolean(resp.request().headers()['next-action']),
      { timeout: 20000 }
    );
    await dialog
      .locator('button')
      .filter({ hasText: /저장|수정|Save|Update/i })
      .first()
      .click();
    expect((await actionResponse).status()).toBe(200);

    const after = await page.request.get(`/api/clients/${testClientId}`);
    expect(((await after.json()) as { isActive: boolean }).isActive).toBe(false);
  });

  test('참조 데이터가 남아 있으면 고객사 삭제가 거부된다', async ({ page }) => {
    expect(testClientId, '앞선 생성 테스트에서 대상 고객사가 준비되어야 함').toBeTruthy();

    // 신규 고객사에는 기본 서비스 분류가 자동으로 하나 생긴다(client.service.ts:188).
    // 따라서 바로 삭제하면 참조 무결성에 걸려야 한다 — 그것이 이 API 의 계약이다.
    const blocked = await page.request.delete(`/api/clients/${testClientId}`);
    expect(blocked.status(), '참조 데이터가 있는데도 고객사가 삭제되었다').toBe(409);

    const body = (await blocked.json()) as { code?: string; error?: string };
    expect(body.code).toBe('REFERENTIAL_INTEGRITY_VIOLATION');
    // 무엇이 남아 막혔는지 알려 줘야 사용자가 다음 행동을 정할 수 있다.
    expect(body.error).toContain('서비스 카테고리');

    // 참조를 걷어내면 삭제가 된다 — 거부가 "무조건 금지" 가 아니라 규칙임을 확인한다.
    await purgeClient(page.request, testClientId!);
    const after = await page.request.get(`/api/clients/${testClientId}`);
    expect(after.status(), '분류를 지운 뒤에도 고객사가 남아 있다').toBe(404);

    testClientId = undefined; // afterAll 이 중복 정리를 시도하지 않도록
  });
});

// ============================================
// CLIENT_USER 경계
// ============================================
test.describe('고객사 관리 - CLIENT_USER 경계', () => {
  test.use({ storageState: PERSONA_AUTH_FILES.client });

  /**
   * 예전 이 테스트는 갈래가 넷이었고 **전부 통과**였다. 등록·수정·삭제 버튼이 보여도
   * `console.log('⚠️ ...')` 로 끝났다.
   *
   * 실측(2026-08-09)으로 확정한 계약: CLIENT_USER 에게 고객사 API 는 읽기·쓰기 모두 403 이다.
   * (자사 정보는 /api/auth/session 의 clientIds 와 SR 목록으로 충분하고, 고객사 카탈로그
   *  자체는 내부 사용자용이다. CLIENT_ADMIN 은 자사 상세만 200 — roles/client-admin.spec.ts 참고.)
   *
   * 알려진 UI 결함: `/clients` 의 '등록' 버튼에 권한 게이트가 없다(clients/page.tsx:167).
   * 서버가 POST 를 403 으로 막으므로 데이터가 새지는 않지만 누르면 실패하는 버튼이다.
   */
  test('고객사 API 는 읽기·쓰기 모두 403 으로 차단된다', async ({ request }) => {
    const list = await request.get('/api/clients?pageSize=5');
    expect(
      list.status(),
      `CLIENT_USER 가 고객사 목록을 조회했습니다. 응답: ${await list.text()}`
    ).toBe(403);

    const create = await request.post('/api/clients', {
      data: { code: `ESC${Date.now().toString().slice(-6)}`, name: 'CLIENT 권한 확인용' },
    });
    expect(
      create.status(),
      `CLIENT_USER 가 고객사를 생성했습니다(권한 상승). 응답: ${await create.text()}`
    ).toBe(403);
  });

  test('고객사 화면에 어떤 고객사도 노출되지 않는다', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });

    // 화면이 렌더된 것을 먼저 확정한 뒤에 부재를 확인해야 의미가 있다.
    await expect(page.getByRole('heading', { name: '고객사 목록', exact: true })).toBeVisible({
      timeout: 20000,
    });

    // 시드 고객사 코드가 하나라도 보이면 테넌트 경계가 무너진 것이다.
    await expect(page.getByText('TEST001', { exact: true })).toHaveCount(0);
    await expect(page.getByText('TEST002', { exact: true })).toHaveCount(0);
  });
});
