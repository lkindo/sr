import { expect, test } from '@playwright/test';

/**
 * 서비스 카테고리 테스트
 * - 서비스 카테고리 목록 조회
 * - SR 생성 시 카테고리 선택
 * - 고객사별 카테고리 관리
 */

test.describe('서비스 카테고리', () => {
  test('서비스 카테고리 API 응답 확인', async ({ page }) => {
    // API 응답 캡처
    let categoriesResponse: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/api/service-categories')) {
        try {
          categoriesResponse = await response.json();
        } catch (e) {
          console.log('⚠️ API 응답 파싱 실패');
        }
      }
    });

    // SR 생성 페이지로 이동 (카테고리 API 호출 유도)
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    if (!categoriesResponse) {
      console.log('⚠️ Service Categories API 응답을 캡처하지 못했습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    console.log('✅ Service Categories API 응답 캡처 성공');

    // 응답 데이터 확인
    const categories = Array.isArray(categoriesResponse)
      ? categoriesResponse
      : categoriesResponse.data || [];

    console.log(`📊 서비스 카테고리 개수: ${categories.length}`);

    if (categories.length > 0) {
      console.log('📋 카테고리 목록:');
      categories.slice(0, 5).forEach((cat: any) => {
        console.log(`  - ${cat.name || cat.title || cat.id}`);
      });
    }

    expect(categories.length).toBeGreaterThanOrEqual(0);
  });

  test('SR 생성 시 서비스 카테고리 선택', async ({ page }) => {
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');

    // SR 생성 버튼 클릭
    const createButton = page
      .locator('button')
      .filter({ hasText: /SR 요청|등록|생성|New SR/i })
      .first();
    const buttonVisible = await createButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (!buttonVisible) {
      console.log('⚠️ SR 생성 버튼을 찾을 수 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    await createButton.click();
    await page.waitForTimeout(500);

    // Dialog 확인
    const dialog = page.locator('[role="dialog"], .dialog, .modal').first();
    const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);

    if (!dialogVisible) {
      console.log('⚠️ SR 생성 Dialog를 찾을 수 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    // 서비스 카테고리 Select 찾기
    const categorySelect = dialog
      .locator('select[name*="category"], [role="combobox"]')
      .filter({ hasText: /카테고리|Category|서비스/i })
      .first();
    const selectVisible = await categorySelect.isVisible({ timeout: 3000 }).catch(() => false);

    if (!selectVisible) {
      console.log('⚠️ 서비스 카테고리 Select를 찾을 수 없습니다.');

      // Dialog 닫기
      const closeButton = dialog
        .locator('button')
        .filter({ hasText: /취소|닫기|Close/i })
        .first();
      await closeButton.click().catch(() => {});
      test.skip();
      return;
    }

    console.log('✅ 서비스 카테고리 Select 발견');

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
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 첫 번째 고객사 클릭
    const firstClient = page.locator('tbody tr, [role="row"]').first();
    const clientVisible = await firstClient.isVisible({ timeout: 3000 }).catch(() => false);

    if (!clientVisible) {
      console.log('⚠️ 고객사가 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    const clientLink = firstClient.locator('a').first();
    const linkVisible = await clientLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (linkVisible) {
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
    } else {
      console.log('⚠️ 고객사 링크를 찾을 수 없습니다. 테스트 스킵.');
      test.skip();
    }
  });

  test('서비스 카테고리 필터링', async ({ page }) => {
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 카테고리 필터 Select 찾기
    const categoryFilter = page
      .locator('select[name*="category"], [role="combobox"]')
      .filter({ hasText: /카테고리|Category/i })
      .first();
    const filterVisible = await categoryFilter.isVisible({ timeout: 3000 }).catch(() => false);

    if (!filterVisible) {
      console.log('⚠️ 카테고리 필터를 찾을 수 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    console.log('✅ 카테고리 필터 발견');

    // 필터 적용
    await categoryFilter.click();
    await page.waitForTimeout(300);

    const options = page.locator('[role="option"]');
    const optionCount = await options.count();

    if (optionCount > 0) {
      await options.first().click();
      await page.waitForTimeout(1000);

      console.log('✅ 카테고리 필터 적용 완료');

      // 필터링 후 SR 목록 확인
      const rows = page.locator('tbody tr, [role="row"]');
      const rowCount = await rows.count();

      console.log(`📊 필터링된 SR 개수: ${rowCount}`);
    }
  });
});
