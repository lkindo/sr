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

  test('SR 생성 시 서비스 카테고리 선택', async ({ page }) => {
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({
      timeout: 15000,
    });

    // SR 생성 버튼 클릭
    const createButton = page
      .locator('button')
      .filter({ hasText: /SR 요청|등록|생성|New SR/i })
      .first();
    await expect(createButton).toBeVisible({ timeout: 10000 });

    await createButton.click();
    await page.waitForTimeout(500);

    // Dialog 확인
    const dialog = page.locator('[role="dialog"], .dialog, .modal').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // 카테고리는 선택된 고객사로 스코프된다(감사 3.19). 고객사를 고르기 전에는
    // categories 가 비어 있어 셀렉트가 disabled 다 — 앱의 의도된 계약이므로
    // 테스트도 고객사 → 카테고리 순서를 지켜야 한다.
    const clientCombobox = dialog.getByRole('combobox', { name: /고객사/ });
    if (await clientCombobox.isEnabled().catch(() => false)) {
      await clientCombobox.click();
      await page.getByRole('option').first().click();
      await page.waitForTimeout(300);
    }

    // 서비스 카테고리 Select 찾기
    const categorySelect = dialog
      .locator('select[name*="category"], [role="combobox"]')
      .filter({ hasText: /카테고리|Category|서비스/i })
      .first();
    await expect(categorySelect).toBeVisible({ timeout: 5000 });

    // 고객사 선택 → 서버 액션 → categories 반영 사이의 레이스를 없앤다.
    // isVisible() 은 enabled 를 보장하지 않아 예전에는 disabled 버튼을 클릭하다 타임아웃났다.
    await expect(categorySelect).toBeEnabled({ timeout: 10000 });

    // Select 클릭
    await categorySelect.click();
    await page.waitForTimeout(300);

    // 옵션 목록 확인
    const options = page.locator('[role="option"]');
    const optionCount = await options.count();

    console.log(`📋 카테고리 옵션 수: ${optionCount}`);

    if (optionCount > 0) {
      // 첫 번째 옵션 선택
      await options.first().click();
      await page.waitForTimeout(500);

      console.log('✅ 서비스 카테고리 선택 완료');
    }

    // Dialog 닫기
    const closeButton = dialog
      .locator('button')
      .filter({ hasText: /취소|닫기|Close/i })
      .first();
    await closeButton.click().catch(() => {});
  });

  test('고객사별 서비스 카테고리 관리 API', async ({ page }) => {
    // 고객사 상세 페이지로 이동
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({
      timeout: 15000,
    });

    // 첫 번째 고객사 클릭
    // 목록은 스켈레톤이 걷힌 뒤에 채워진다. 행이 아니라 "상세로 가는 링크"를 직접
    // 기다려야 빈 tbody 를 잡고 실패하지 않는다.
    const clientLink = page.locator('tbody a[href^="/clients/"]').first();
    await expect(clientLink).toBeVisible({ timeout: 20000 });

    {
      // API 응답 캡처
      let clientCategoriesResponse: any = null;

      page.on('response', async (response) => {
        if (response.url().includes('/api/clients/') && response.url().includes('/categories')) {
          try {
            clientCategoriesResponse = await response.json();
          } catch (e) {
            // 파싱 실패 무시
          }
        }
      });

      await clientLink.click();
      await page.waitForTimeout(2000);

      // URL 확인
      const url = page.url();
      const isClientDetailPage = url.includes('/clients/') && url.split('/clients/')[1];

      if (isClientDetailPage) {
        console.log('✅ 고객사 상세 페이지 접근');

        if (clientCategoriesResponse) {
          console.log('✅ 고객사별 카테고리 API 응답 확인');

          const categories = Array.isArray(clientCategoriesResponse)
            ? clientCategoriesResponse
            : clientCategoriesResponse.data || [];
          console.log(`📊 고객사 카테고리 수: ${categories.length}`);
        } else {
          console.log('⚠️ 고객사별 카테고리 API 호출이 없거나 응답을 캡처하지 못했습니다.');
        }
      }
    }
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
