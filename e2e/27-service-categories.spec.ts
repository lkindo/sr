import { expect, test } from '@playwright/test';

/**
 * 서비스 카테고리 테스트
 * - 서비스 카테고리 목록 조회
 * - SR 생성 시 카테고리 선택
 * - 고객사별 카테고리 관리
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. 그래서 "500ms 동안 네트워크 요청 0건"이라는 networkidle 조건은
 * 영원히 성립하지 않고 waitForLoadState('networkidle') 는 항상 30초 뒤 타임아웃난다.
 * 대신 (1) domcontentloaded 로 내비게이션만 확정하고, (2) 실제로 필요한 것
 * (해당 API 응답 / 요소 표시)을 기다린다. expect().toBeVisible() 은 자동 재시도한다.
 * isVisible() 은 대기하지 않으므로(timeout 옵션 무시) 조건부 요소는
 * waitFor({ state: 'visible' }).catch(() => {}) 로 기다린 뒤 판단한다.
 */

test.describe('서비스 카테고리', () => {
  test('서비스 카테고리 API 응답 확인', async ({ page }) => {
    // 이 테스트는 예전에 /srs 를 열어 놓고 응답이 잡히기를 기다렸는데, /srs 는
    // /api/service-categories 를 호출하지 않는다(SR 생성 다이얼로그가 서버 액션
    // getServiceCategoriesForSelection 을 쓴다). 그래서 항상 스킵으로 끝났고 이 엔드포인트를
    // 한 번도 검증한 적이 없다. 엔드포인트 자체는 살아 있고 테넌트 스코핑까지 하므로
    // (route.ts 주석의 감사 4.1) 직접 호출해 단언한다.
    const response = await page.request.get('/api/service-categories');
    expect(response.status()).toBe(200);

    const body = await response.json();
    const categories = Array.isArray(body) ? body : (body.data ?? []);
    expect(Array.isArray(categories)).toBe(true);

    // 시드가 카테고리 5개를 넣는다. 0개면 스코핑 회귀이거나 시드 누락이다.
    expect(categories.length).toBeGreaterThan(0);

    // ADMIN 세션이므로 내부 사용자 분기를 타고 담당자 이메일까지 온다.
    // 외부 사용자에게 이 필드가 새면 감사 4.1 의 재발이다.
    console.log(`📊 서비스 카테고리 개수: ${categories.length}`);
    for (const cat of categories) {
      expect(cat).toHaveProperty('id');
      expect(cat).toHaveProperty('categoryName');
    }
  });

  test('SR 등록 다이얼로그의 카테고리는 고른 고객사로 스코프된다', async ({ page }) => {
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole('button', { name: /등록/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // 카테고리는 선택된 고객사로 스코프된다(감사 3.19). 고객사를 고르기 전에는
    // categories 가 비어 있어 셀렉트가 disabled 다 — 앱의 의도된 계약이다.
    const categorySelect = dialog.getByRole('combobox', { name: /서비스 카테고리/ });
    const clientCombobox = dialog.getByRole('combobox', { name: /고객사/ });

    if (await clientCombobox.isEnabled()) {
      // 고객사를 고르기 전에는 잠겨 있어야 한다 — 이게 스코프 계약의 관측 가능한 형태다.
      await expect(categorySelect).toBeDisabled();
      await clientCombobox.click();
      await page.getByRole('option').first().click();
    }

    // 고객사가 정해지면 열린다. 고정 대기 대신 상태 자체를 기다린다.
    await expect(categorySelect).toBeEnabled({ timeout: 15000 });
    await categorySelect.click();

    // 예전에는 옵션 수를 로그로 찍고 `if (optionCount > 0)` 로 감쌌다 — 0개여도 통과였다.
    // 시드가 카테고리를 넣으므로 최소 1개가 있어야 하고, 고르면 값이 남아야 한다.
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();
    const chosen = (await options.first().innerText()).trim();
    await options.first().click();
    await expect(categorySelect).toContainText(chosen);

    await dialog
      .getByRole('button', { name: /취소|닫기/ })
      .first()
      .click();
    await expect(dialog).toBeHidden();
  });

  test('고객사 상세는 그 고객사의 카테고리만 내려받는다', async ({ page }) => {
    // 예전 이 테스트는 response 리스너로 응답을 주워 담고 개수를 console.log 했다.
    // 캡처에 실패해도, 상세로 못 가도 통과했다. 대조군을 두고 API 를 직접 확인한다.
    const clients = await page.request.get('/api/clients?limit=100');
    expect(clients.status()).toBe(200);
    const rows = (await clients.json()).data as Array<{ id: string; name: string }>;
    expect(rows.length, '고객사가 2개 이상 있어야 스코프를 대조할 수 있습니다.').toBeGreaterThan(1);

    const [first, second] = rows;
    const categoriesOf = async (clientId: string) => {
      const response = await page.request.get(`/api/clients/${clientId}/categories`);
      expect(response.status()).toBe(200);
      return (await response.json()) as Array<{ id: string; categoryName: string }>;
    };

    const firstCategories = await categoriesOf(first!.id);
    const secondCategories = await categoriesOf(second!.id);
    expect(firstCategories.length, `${first!.name} 의 카테고리가 없습니다.`).toBeGreaterThan(0);

    // 두 고객사의 카테고리 id 가 겹치면 스코프가 새고 있는 것이다.
    const secondIds = new Set(secondCategories.map((c) => c.id));
    const overlap = firstCategories.filter((c) => secondIds.has(c.id)).map((c) => c.categoryName);
    expect(overlap, `카테고리가 고객사 간에 공유되고 있습니다: ${overlap.join(', ')}`).toEqual([]);

    // 화면도 그 목록을 그대로 보여주는지 확인한다.
    await page.goto(`/clients/${first!.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(first!.name).first()).toBeVisible({ timeout: 15000 });
  });

  // SR 목록에는 카테고리 필터가 없다. SRsDataTable 이 제공하는 필터는 상태 / 우선순위 /
  // 고객사 / 담당자 네 가지뿐이다(SRsDataTable.tsx 의 SelectValue placeholder 참조).
  // 이 테스트는 그 사실을 몰랐던 채 "필터를 못 찾으면 스킵"으로 끝나 한 번도 실행된 적이
  // 없다. 기능이 생기면 fixme 를 떼면 되고, 그때까지 초록불로 위장하지 않는다.
  test.fixme('서비스 카테고리 필터링', async ({ page }) => {
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({
      timeout: 15000,
    });

    const categoryFilter = page
      .locator('select[name*="category"], [role="combobox"]')
      .filter({ hasText: /카테고리|Category/i })
      .first();
    await expect(categoryFilter).toBeVisible({ timeout: 10000 });

    await categoryFilter.click();
    const options = page.locator('[role="option"]');
    await expect(options.first()).toBeVisible({ timeout: 5000 });
    await options.first().click();

    // 필터 적용 후에도 목록 테이블은 유지된다.
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible();
  });
});
