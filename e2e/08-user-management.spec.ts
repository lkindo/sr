import { expect, test } from '@playwright/test';

import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';

/**
 * 사용자 관리 — ADMIN 의 CRUD 와 CLIENT_USER 의 경계.
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. "500ms 동안 네트워크 요청 0건" 이 성립하지 않아 항상 타임아웃난다.
 *
 * '사용자 목록 페이지 접근' 테스트는 00-smoke.spec.ts 로 옮겼다 — 라우트가 열리는지는
 * 한 곳에서만 확인한다.
 */

// ============================================
// ADMIN 권한
// ============================================
test.describe('사용자 관리 - ADMIN 권한', () => {
  test.use({ storageState: PERSONA_AUTH_FILES.admin });
  test.describe.configure({ mode: 'serial' });

  let testUserEmail: string;
  let testUserName: string;
  let testUserId: string | undefined;

  test.afterAll(async ({ browser }) => {
    // 공유 DB 를 쓰므로 만든 계정은 반드시 지운다. 예전에는 정리가 없어
    // 'E2E Test User <timestamp>' 가 실행할 때마다 쌓였고, 그만큼 사용자 목록의
    // 행 수·페이지 수가 매 실행 달라졌다.
    if (!testUserId) return;
    const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES.admin });
    try {
      const response = await context.request.delete(`/api/users/${testUserId}?hard=true`);
      if (!response.ok()) {
        console.warn(`사용자 정리 실패: DELETE /api/users/${testUserId} → ${response.status()}`);
      }
    } finally {
      await context.close();
    }
  });

  test('검색어를 넣으면 그 사용자만 남는다', async ({ page }) => {
    await page.goto('/users', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({
      timeout: 20000,
    });

    // 예전에는 'test' 를 입력하고 500ms 기다린 뒤 아무것도 확인하지 않았다.
    // 시드에 반드시 있는 계정으로 검색해 결과가 실제로 좁혀지는지 본다.
    const search = page.locator('input[type="search"], input[placeholder*="검색"]').first();
    await expect(search).toBeVisible({ timeout: 10000 });
    await search.fill('engineeruser@example.com');

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(1, { timeout: 15000 });
    await expect(rows.first()).toContainText('engineeruser@example.com');
  });

  test('사용자 등록 버튼이 보여야 함', async ({ page }) => {
    await page.goto('/users', { waitUntil: 'domcontentloaded' });

    const createButton = page.getByRole('button', { name: '사용자 등록' });
    await expect(createButton).toBeVisible({ timeout: 20000 });
  });

  test('사용자 생성 전체 플로우', async ({ page }) => {
    await page.goto('/users', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: '사용자 등록' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const timestamp = Date.now();
    testUserName = `E2E Test User ${timestamp}`;
    testUserEmail = `e2etest${timestamp}@example.com`;

    await dialog
      .locator('input[name="name"], input[placeholder*="이름"], input[id*="name"]')
      .first()
      .fill(testUserName);
    await dialog.locator('input[name="email"], input[type="email"]').first().fill(testUserEmail);

    const passwordInput = dialog.locator('input[name="password"], input[type="password"]').first();
    if (await passwordInput.count()) {
      await passwordInput.fill('Test1234!');
      const confirmPassword = dialog
        .locator('input[name="confirmPassword"], input[placeholder*="확인"], input[id*="confirm"]')
        .first();
      if (await confirmPassword.count()) {
        await confirmPassword.fill('Test1234!');
      }
    }

    // 저장이 실제로 서버에 닿았는지 확인한다. 예전에는 2초를 기다린 뒤 목록에서
    // 찾았기 때문에, 생성이 실패해도 "목록 갱신이 늦었나" 로 보였다.
    const createResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/users') && resp.request().method() === 'POST',
      { timeout: 20000 }
    );
    await dialog
      .locator('button')
      .filter({ hasText: /저장|등록|생성|Save|Create/i })
      .first()
      .click();

    const response = await createResponse;
    expect(response.status(), `사용자 생성 실패: ${await response.text()}`).toBe(201);
    testUserId = ((await response.json()) as { id: string }).id;

    // 목록에도 나타나야 한다.
    await page.goto(`/users?q=${encodeURIComponent(testUserEmail)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('tbody tr').filter({ hasText: testUserEmail })).toBeVisible({
      timeout: 20000,
    });
  });

  test('역할 관리 다이얼로그를 열 수 있다', async ({ page }) => {
    expect(testUserEmail, '앞선 생성 테스트에서 대상 계정이 준비되어야 함').toBeTruthy();

    await page.goto(`/users?q=${encodeURIComponent(testUserEmail)}`, {
      waitUntil: 'domcontentloaded',
    });

    const targetRow = page.locator('tbody tr').filter({ hasText: testUserEmail });
    await expect(targetRow).toBeVisible({ timeout: 20000 });

    await targetRow.locator('button').first().click();
    await expect(page.getByText('1명 선택')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: '역할 관리' }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: /역할|Role/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // 다이얼로그가 실제 역할 카탈로그를 보여 줘야 한다 — 껍데기만 열리는 회귀를 잡는다.
    await expect(dialog.getByText('ENGINEER', { exact: true })).toBeVisible({ timeout: 10000 });

    await dialog
      .locator('button')
      .filter({ hasText: /취소|닫기|Close|Cancel/i })
      .first()
      .click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('사용자 비활성/활성 상태 전환 (신규 UI)', async ({ page }) => {
    // 대상은 앞 테스트가 만든 전용 계정으로 고정한다(describe 가 serial 이므로 반드시 존재한다).
    // "첫 번째 행"에 의존하면 안 된다: /api/users 는 sortBy 미지정 시 orderBy 없이 조회하므로
    // (src/lib/pagination.ts getPrismaOrderBy → undefined) 행 순서가 보장되지 않고,
    // 시드 계정이 늘어나면 첫 행과 그 상태가 같이 바뀐다.
    expect(testUserEmail, '앞선 사용자 생성 테스트에서 대상 계정이 준비되어야 함').toBeTruthy();

    // q=<이메일> 로 대상만 남기고, isActive=all 로 활성/비활성 어느 상태든 목록에 남게 한다.
    // (기본 상태 필터는 'true' 여서 비활성으로 바꾸는 순간 행이 목록에서 사라진다.)
    await page.goto(`/users?q=${encodeURIComponent(testUserEmail)}&isActive=all`, {
      waitUntil: 'domcontentloaded',
    });

    // 행을 이메일로 특정한다. 목록 로딩 중에는 tbody 에 '로딩 중...' 플레이스홀더 행 하나만
    // 있는데(UserTable.tsx colSpan=7), 예전 코드는 그 행을 "첫 번째 사용자"로 잡아 상태를
    // 잘못 읽었다. 이메일 필터는 플레이스홀더와 절대 겹치지 않아 고정 대기 없이 경합이 사라진다.
    const targetRow = page.locator('tbody tr').filter({ hasText: testUserEmail });
    await expect(targetRow).toBeVisible({ timeout: 20000 });

    // 상태 Badge 는 정확히 '활성' 또는 '비활성' 이다(UserTable.tsx:173-175).
    // '비활성'.includes('활성') === true 이므로 부분 문자열 비교는 금지, 완전 일치로 읽는다.
    // 상태 필터 탭에도 같은 라벨이 있어서 반드시 마지막 td(상태 열) 안으로 범위를 좁힌다.
    const statusBadge = targetRow
      .locator('td')
      .last()
      .getByText(/^(활성|비활성)$/)
      .first();
    await expect(statusBadge).toHaveText(/^(활성|비활성)$/, { timeout: 10000 });
    const isCurrentlyActive = (await statusBadge.innerText()).trim() === '활성';

    // 체크박스(행의 첫 번째 버튼) 클릭 → 일괄 작업 바로 선택 반영을 먼저 확정한다.
    await targetRow.locator('button').first().click();
    await expect(page.getByText('1명 선택')).toBeVisible({ timeout: 5000 });

    // 1) 현재 상태의 반대 방향으로 전환
    const actionButtonText = isCurrentlyActive ? '일괄 비활성화' : '일괄 활성화';
    const actionButton = page.getByRole('button', { name: actionButtonText, exact: true });
    await expect(actionButton).toBeVisible({ timeout: 5000 });
    await actionButton.click();

    // 토스트 메시지 대기 및 확인 (UsersClient handleToggleActive → title: '상태 변경 완료')
    await expect(page.getByText('상태 변경 완료').first()).toBeVisible({ timeout: 5000 });

    // 토스트만 믿지 않고 목록 갱신 후 상태 Badge 가 실제로 뒤집혔는지 확인한다.
    await expect(statusBadge).toHaveText(isCurrentlyActive ? '비활성' : '활성', { timeout: 10000 });

    // 2) 반대 버튼까지 실제로 검증하고 계정 상태를 원래대로 되돌린다.
    // 선택은 유지되므로(selectedUserIds 는 id 기준) 일괄 작업 바가 그대로 남아 있다.
    const revertButtonText = isCurrentlyActive ? '일괄 활성화' : '일괄 비활성화';
    const revertButton = page.getByRole('button', { name: revertButtonText, exact: true });
    await expect(revertButton).toBeVisible({ timeout: 10000 });
    await revertButton.click();

    await expect(statusBadge).toHaveText(isCurrentlyActive ? '활성' : '비활성', { timeout: 10000 });
  });
});

// ============================================
// CLIENT_USER 경계
// ============================================
test.describe('사용자 관리 - CLIENT_USER 경계', () => {
  test.use({ storageState: PERSONA_AUTH_FILES.client });

  /**
   * 예전 이 테스트는 세 갈래 if 였고 **모든 갈래가 통과**였다. 등록 버튼이 보이면
   * `console.log('⚠️ CLIENT에게 등록 버튼이 보임 - 권한 설정 확인 필요')` 를 찍고 넘어갔다.
   * 즉 권한 상승이 실제로 일어나도 초록불이었다.
   *
   * 실측(2026-08-09)으로 확정한 계약: CLIENT_USER 에게 사용자 API 는 읽기·쓰기 모두 403 이다.
   * 그 경계를 단언한다.
   *
   * 알려진 UI 결함(이 스펙이 드러낸 것): `/users` 의 '사용자 등록' 버튼은 권한 게이트가 없어
   * CLIENT_USER 에게도 렌더된다(UsersClient.tsx:364). 서버가 POST 를 403 으로 막으므로
   * 데이터가 새지는 않지만, 누르면 실패하는 버튼을 보여 주는 것은 결함이다.
   * 버튼 부재를 단언하면 지금 빨간불이 되므로, **막혀 있는 것이 확실한 서버 경계**를 단언하고
   * UI 게이트는 앱 수정과 함께 별도로 다룬다.
   */
  test('사용자 API 는 읽기·쓰기 모두 403 으로 차단된다', async ({ request }) => {
    const list = await request.get('/api/users?pageSize=5');
    expect(
      list.status(),
      `CLIENT_USER 가 사용자 목록을 조회했습니다. 응답: ${await list.text()}`
    ).toBe(403);

    const create = await request.post('/api/users', {
      data: {
        name: 'CLIENT 권한 확인용',
        email: `client-escalation-${Date.now()}@example.com`,
        password: 'Test1234!',
      },
    });
    expect(
      create.status(),
      `CLIENT_USER 가 사용자를 생성했습니다(권한 상승). 응답: ${await create.text()}`
    ).toBe(403);
  });

  test('사용자 화면에 다른 사용자 데이터가 노출되지 않는다', async ({ page }) => {
    await page.goto('/users', { waitUntil: 'domcontentloaded' });

    // 화면이 렌더된 것을 먼저 확정한다. 렌더 전에 "행이 없다" 를 확인하면
    // 아직 안 그려진 것과 구분할 수 없어 아무것도 검증하지 못한다.
    await expect(page.getByRole('heading', { name: '사용자 목록', exact: true })).toBeVisible({
      timeout: 20000,
    });

    // API 가 403 이므로 목록에는 어떤 사용자 행도 있어서는 안 된다.
    await expect(page.locator('tbody tr').filter({ hasText: '@example.com' })).toHaveCount(0);
  });
});
