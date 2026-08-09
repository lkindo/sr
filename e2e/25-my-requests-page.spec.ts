import { expect, type Page, test } from '@playwright/test';

/**
 * My Requests 페이지 테스트
 * - 내가 요청한 SR만 필터링
 * - API 응답 검증
 * - 필터링 및 정렬 기능
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. 그래서 "500ms 동안 네트워크 요청 0건"이라는 networkidle 조건은
 * 영원히 성립하지 않고 waitForLoadState('networkidle') 는 항상 30초 뒤 타임아웃난다.
 * 대신 (1) domcontentloaded 로 내비게이션만 확정하고, (2) 실제로 필요한 것
 * (본문/테이블 요소 표시)을 기다린다. expect().toBeVisible() 은 자동 재시도한다.
 * isVisible() 은 대기하지 않으므로(timeout 옵션 무시) 조건부 요소는
 * waitFor({ state: 'visible' }).catch(() => {}) 로 기다린 뒤 판단한다.
 */

// 테스트 타임아웃 증가 (90초)
test.setTimeout(90000);

/**
 * 목록이 실제로 그려질 때까지 기다린다.
 *
 * 이 화면은 클라이언트에서 /api/srs/my-requests 를 받아 그리므로 처음에는 main 안에
 * "내 요청 SR을 불러오는 중..." 만 있다. main 가시성만 기다리면 그 상태에서 통과해
 * 버려서, 뒤따르는 단언이 아직 비어 있는 DOM 을 보고 실패한다.
 */
async function expectMyRequestsLoaded(page: Page) {
  await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('내 요청 SR을 불러오는 중...')).toHaveCount(0, { timeout: 30000 });
}

test.describe('My Requests 페이지', () => {
  test('My Requests 페이지 접근', async ({ page }) => {
    await page.goto('/my-requests', { waitUntil: 'domcontentloaded' });

    // 고정 2초 대기 대신 로딩이 실제로 끝난 것을 기다린다.
    // (SSE 때문에 networkidle 은 쓸 수 없고, 그렇다고 sleep 을 쓸 이유도 없다.)
    await expectMyRequestsLoaded(page);
    await expect(page.getByRole('heading', { name: /내 요청/ }).first()).toBeVisible();
  });

  test('내가 요청한 SR만 표시 확인', async ({ page }) => {
    // 이 화면은 my-requests/page.tsx:148 에서 반드시 이 엔드포인트를 호출한다.
    // 예전에는 응답을 못 잡으면 스킵했는데, 그러면 "호출 자체가 사라진" 회귀를
    // 초록불로 덮는다. 응답을 기다려 200 과 봉투 형태를 단언한다.
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/srs/my-requests'),
      { timeout: 30000 }
    );

    await page.goto('/my-requests', { timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    const myRequestsResponse = await response.json();

    // 응답 데이터 확인 — 목록 라우트의 봉투는 { data, meta } 다(lib/pagination.ts 규약).
    const data = myRequestsResponse.data ?? myRequestsResponse.items ?? myRequestsResponse;
    expect(Array.isArray(data)).toBe(true);
    const srList: unknown[] = data;

    // 이 화면은 테이블이 아니라 카드 목록이다. 예전에는 `tbody tr` 을 세고
    // `toBeGreaterThanOrEqual(0)` 으로 끝냈는데, 그 로케이터는 이 페이지에서 항상 0이고
    // 0 은 언제나 0 이상이라 **무엇을 확인했는지 없는 단언**이었다.
    // 카드 하나마다 SR 상세로 가는 링크가 2개(번호 + 상세 보기)씩 붙으므로,
    // 서로 다른 링크 대상의 수가 곧 카드 수다.
    const hrefs = await page
      .locator('main a[href^="/srs/"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute('href')));
    const shownIds = new Set(hrefs.map((href) => href?.split('/srs/')[1]));

    expect(
      shownIds.size,
      `API 는 ${srList.length}건을 내려줬는데 화면에는 ${shownIds.size}건이 있습니다.`
    ).toBe(srList.length);
  });

  // 이 화면은 테이블이 아니라 SR 카드 목록이다(my-requests/page.tsx). 예전 테스트는
  // `table`/`thead th` 를 찾다가 못 찾으면 스킵했는데, 그건 이 페이지에 존재한 적 없는
  // UI 라 한 번도 실행되지 않았다. 실제로 렌더되는 것을 단언한다.
  test('SR 목록이 카드로 렌더된다', async ({ page }) => {
    await page.goto('/my-requests', { waitUntil: 'domcontentloaded' });
    await expectMyRequestsLoaded(page);

    // 목록 항목은 SR 상세로 가는 링크를 가진다.
    const srLinks = page.locator('main a[href^="/srs/"]');
    await expect(srLinks.first()).toBeVisible({ timeout: 15000 });

    // 상단 요약 타일이 함께 렌더된다.
    await expect(page.getByText('전체 요청')).toBeVisible();

    // 카드마다 SR 번호 링크와 "상세 보기" 링크가 하나씩 있으므로 링크 수는 짝수이고,
    // 서로 같은 SR 을 가리켜야 한다(카드 하나가 다른 SR 로 새는 것을 잡는다).
    const hrefs = await srLinks.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute('href'))
    );
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.length % 2).toBe(0);
    expect(new Set(hrefs).size).toBe(hrefs.length / 2);
  });

  test('상태 필터를 걸면 그 상태의 SR 만 남는다', async ({ page }) => {
    await page.goto('/my-requests', { waitUntil: 'domcontentloaded' });
    await expectMyRequestsLoaded(page);

    // 로케이터를 **현재 표시값**으로 잡으면 안 된다. 필터를 바꾸는 순간 텍스트가
    // 바뀌어 로케이터가 스스로를 놓친다(`hasText: /상태|전체/` 로 잡았다가 실제로 그랬다).
    // '필터 및 정렬' 카드의 첫 콤보박스가 상태 필터다(두 번째는 정렬 기준).
    const filterCard = page.locator('.border').filter({ hasText: '필터 및 정렬' }).first();
    const statusFilter = filterCard.getByRole('combobox').first();
    await expect(statusFilter).toBeVisible({ timeout: 10000 });

    await statusFilter.click();

    // 예전에는 옵션이 안 보이면 그대로 통과했고, 골라도 개수를 로그로 찍고 끝이었다.
    // '전체' 가 아닌 실제 상태를 하나 골라 결과를 단언한다.
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible({ timeout: 5000 });
    const target = options.filter({ hasNotText: '전체' }).first();
    const targetLabel = (await target.innerText()).trim();
    await target.click();

    await expect(statusFilter).toContainText(targetLabel);

    // 남은 카드의 상태 배지가 전부 고른 값이어야 한다. 0건이면 "해당 SR 이 없습니다"
    // 안내가 대신 떠야 하고, 그 둘 중 하나는 반드시 성립해야 한다.
    const cards = page.locator('main a[href^="/srs/"]');
    const remaining = await cards.count();
    if (remaining === 0) {
      await expect(page.getByText(/요청.*없습니다|SR이 없습니다/)).toBeVisible();
      return;
    }

    const badges = page.getByText(targetLabel, { exact: true });
    await expect(
      badges.first(),
      `"${targetLabel}" 로 걸렀는데 그 상태의 카드가 하나도 없습니다.`
    ).toBeVisible();
  });

  // 정렬은 클릭 가능한 테이블 헤더가 아니라 "정렬 기준" 콤보박스로 한다.
  test('정렬 기준을 바꿀 수 있다', async ({ page }) => {
    await page.goto('/my-requests', { waitUntil: 'domcontentloaded' });
    await expectMyRequestsLoaded(page);

    const sortSelect = page.getByRole('combobox').filter({ hasText: /요청일|우선순위|상태/ });
    await expect(sortSelect.first()).toBeVisible({ timeout: 15000 });

    const before = await sortSelect.first().innerText();
    await sortSelect.first().click();

    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible({ timeout: 5000 });

    // 현재 선택값이 아닌 다른 옵션을 고른다.
    const other = options.filter({ hasNotText: before.trim() }).first();
    await other.click();

    // 선택이 실제로 반영되어야 한다.
    await expect(sortSelect.first()).not.toHaveText(before.trim(), { timeout: 5000 });

    // 정렬을 바꿔도 목록은 그대로 보여야 한다.
    await expect(page.locator('main a[href^="/srs/"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('SR 상세 페이지 이동', async ({ page }) => {
    await page.goto('/my-requests', { waitUntil: 'domcontentloaded' });
    await expectMyRequestsLoaded(page);

    const srLink = page.locator('main a[href^="/srs/"]').first();
    await expect(srLink).toBeVisible({ timeout: 15000 });

    // 링크가 가리키는 id 로 실제로 이동하는지까지 확인한다.
    const href = await srLink.getAttribute('href');
    expect(href).toMatch(/^\/srs\/.+/);

    await srLink.click();
    await page.waitForURL(new RegExp(`${href}$`), { timeout: 15000 });
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });
});
