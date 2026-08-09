import { expect, type Page, test } from '@playwright/test';

/**
 * SR 목록의 검색과 필터 — **목록이 실제로 좁혀지는가**.
 *
 * 예전 5개 테스트는 필터 UI 를 찾기만 하고 결과를 보지 않았다. 전형적으로
 * "고급 필터 버튼이 있으면 클릭 → 옵션이 있으면 개수를 로그" 로 끝났고,
 * 필터가 아무 일도 하지 않아도 통과했다. 03-sr-list.spec.ts 에도 같은 검사가
 * 중복돼 있었고(그 파일은 이 커밋에서 삭제했다), 03 의 '빈 SR 목록 처리' 는
 * 오류 다이얼로그가 없는지만 보고 빈 상태 화면 자체는 확인하지 않았다.
 *
 * 여기서는 필터를 적용한 뒤 (1) URL 파라미터, (2) 남은 행의 실제 값, (3) 빈 결과일 때의
 * 안내 화면까지 대조한다. 목록이 열리는지는 00-smoke.spec.ts 가 본다.
 *
 * ⚠️ networkidle 금지 — 인증된 페이지는 /api/realtime SSE 를 계속 열어 둔다.
 */

async function expectListRendered(page: Page) {
  await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({ timeout: 20000 });
}

/** 상세 필터 패널을 연다 (기본은 접혀 있다). */
async function openAdvancedFilters(page: Page) {
  await page.getByRole('button', { name: '상세 필터' }).click();
  await expect(page.getByRole('region', { name: '상세 필터 옵션' })).toBeVisible({
    timeout: 10000,
  });
}

/** 지정한 열의 보이는 값들을 읽는다 (1-based). */
async function columnTexts(page: Page, nth: number): Promise<string[]> {
  const texts = await page.locator(`tbody tr td:nth-child(${nth})`).allInnerTexts();
  return texts.map((t) => t.trim());
}

/**
 * SR 번호 열에서 번호만 뽑는다.
 *
 * 셀 안에는 복사 버튼이 함께 있어서 innerText 가 "SR-20260807-0001 복사" 가 된다.
 * 자릿수를 고정하지 않는 이유: 시드 SR 은 `SR-2024-001`(4-3자리)이고 런타임 생성분은
 * `SR-20260809-0001`(8-4자리)이다. 한쪽만 맞추면 데이터 구성에 따라 조용히 0건이 된다.
 */
async function visibleSrNumbers(page: Page): Promise<string[]> {
  return (await columnTexts(page, 1))
    .map((text) => text.match(/SR-\d+-\d+/)?.[0])
    .filter((n): n is string => Boolean(n));
}

/**
 * 빈 상태 안내. 데스크톱 테이블과 모바일 카드가 각각 EmptyState 를 렌더하므로
 * (한쪽은 CSS 로 숨겨진다) 보이는 것만 겨냥해야 strict mode 위반이 나지 않는다.
 */
const emptyState = (page: Page) => page.getByText('검색 결과가 없습니다').filter({ visible: true });

test.describe('SR 검색', () => {
  test('검색어를 넣으면 그 문자열을 가진 SR 만 남는다', async ({ page }) => {
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expectListRendered(page);

    // 기준값: 지금 목록의 첫 SR 번호. 그것으로 검색하면 그 건만 남아야 한다.
    const allNumbers = await visibleSrNumbers(page);
    expect(allNumbers.length, '검색을 확인하려면 SR 이 최소 1건 있어야 한다').toBeGreaterThan(0);
    const target = allNumbers[0]!;

    const search = page.getByRole('textbox', { name: '검색어 입력' });
    await search.fill(target);

    // 검색은 500ms 디바운스 후 URL 로 반영된다(SRsDataTable 의 useDebounce).
    // 고정 대기 대신 그 관측 가능한 결과인 URL 변화를 기다린다.
    // URLSearchParams 는 공백을 '+' 로 쓰므로 encodeURIComponent 로는 맞출 수 없다.
    // SR 번호에는 인코딩이 필요한 문자가 없으니 그대로 넣는다.
    await expect(page).toHaveURL(new RegExp(`search=${target}`), { timeout: 15000 });
    await expectListRendered(page);

    const filtered = await visibleSrNumbers(page);
    expect(filtered.length, '검색 결과가 비었다').toBeGreaterThan(0);
    for (const number of filtered) {
      expect(number, `검색어 "${target}" 와 무관한 행이 남아 있다`).toBe(target);
    }
  });

  test('결과가 없는 검색어는 빈 상태 화면을 보여 준다', async ({ page }) => {
    // 03-sr-list.spec.ts 의 '빈 SR 목록 처리' 를 흡수한 것. 원래는 오류 다이얼로그가
    // 없는지만 확인했는데, 그건 화면이 통째로 비어 있어도 통과한다.
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expectListRendered(page);

    const search = page.getByRole('textbox', { name: '검색어 입력' });
    await search.fill('존재하지않는SR검색어-zzzz-0000');

    await expect(emptyState(page)).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText('다른 검색어나 필터를 시도해보세요.').filter({ visible: true })
    ).toBeVisible();

    // 빈 상태에는 빠져나갈 길이 있어야 한다.
    await expect(page.getByRole('button', { name: '필터 초기화' }).first()).toBeVisible();
  });
});

test.describe('SR 상세 필터', () => {
  test('상태 필터를 걸면 그 상태의 SR 만 남는다', async ({ page }) => {
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expectListRendered(page);
    await openAdvancedFilters(page);

    await page.getByLabel('상태', { exact: true }).click();
    await page.getByRole('option', { name: '요청됨', exact: true }).click();

    await expect(page).toHaveURL(/status=REQUESTED/, { timeout: 15000 });

    // 결과가 0건일 수도 있다. 그때는 빈 상태가, 아니면 모든 행이 '요청됨' 이어야 한다.
    // 어느 쪽이든 단언한다 — "행이 없으면 통과" 로 두면 필터가 전부 지워 버려도 모른다.
    const empty = emptyState(page);
    const table = page.locator('table:not([data-skeleton]):visible');
    await expect(empty.or(table).first()).toBeVisible({ timeout: 15000 });

    if (await empty.isVisible()) {
      const api = await page.request.get('/api/srs?status=REQUESTED&pageSize=1');
      const body = (await api.json()) as { meta?: { totalItems?: number } };
      expect(body.meta?.totalItems ?? 0, 'REQUESTED SR 이 있는데 화면은 비어 있다').toBe(0);
      return;
    }

    // 상태 열은 7번째다 (SR번호/제목/고객사/요청자/담당자/우선순위/상태).
    const statuses = await columnTexts(page, 7);
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(status, 'status=REQUESTED 필터인데 다른 상태의 행이 남아 있다').toContain('요청됨');
    }
  });

  test('우선순위 필터를 걸면 그 우선순위의 SR 만 남는다', async ({ page }) => {
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expectListRendered(page);
    await openAdvancedFilters(page);

    await page.getByLabel('우선순위', { exact: true }).click();
    await page.getByRole('option', { name: '보통', exact: true }).click();

    await expect(page).toHaveURL(/priority=MEDIUM/, { timeout: 15000 });

    const empty = emptyState(page);
    const table = page.locator('table:not([data-skeleton]):visible');
    await expect(empty.or(table).first()).toBeVisible({ timeout: 15000 });

    if (await empty.isVisible()) {
      const api = await page.request.get('/api/srs?priority=MEDIUM&pageSize=1');
      const body = (await api.json()) as { meta?: { totalItems?: number } };
      expect(body.meta?.totalItems ?? 0, 'MEDIUM SR 이 있는데 화면은 비어 있다').toBe(0);
      return;
    }

    const priorities = await columnTexts(page, 6);
    expect(priorities.length).toBeGreaterThan(0);
    for (const priority of priorities) {
      expect(priority, 'priority=MEDIUM 필터인데 다른 우선순위의 행이 남아 있다').toContain('보통');
    }
  });

  test('필터 초기화는 URL 파라미터와 목록을 모두 원래대로 돌린다', async ({ page }) => {
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expectListRendered(page);
    const before = (await visibleSrNumbers(page)).length;

    await openAdvancedFilters(page);
    await page.getByLabel('상태', { exact: true }).click();
    await page.getByRole('option', { name: '요청됨', exact: true }).click();
    await expect(page).toHaveURL(/status=REQUESTED/, { timeout: 15000 });

    await page.getByRole('button', { name: '필터 초기화' }).first().click();

    await expect(page, '초기화했는데 status 파라미터가 남아 있다').not.toHaveURL(
      /status=REQUESTED/,
      { timeout: 15000 }
    );
    await expectListRendered(page);
    expect((await visibleSrNumbers(page)).length, '초기화 후 행 수가 필터 걸기 전과 다르다').toBe(
      before
    );
  });
});
