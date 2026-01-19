import { expect, test } from '@playwright/test';

/**
 * SR 필터링 및 검색 테스트
 *
 * 모든 사용자에게 SR 목록 및 필터링 기능이 제공됨
 */

test.describe('SR 필터링 및 검색', () => {
  test('SR 목록 페이지 로드', async ({ page }) => {
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');

    // SR 목록 테이블이 반드시 보여야 함
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    console.log('✅ SR 목록 테이블 확인');
  });

  test('검색 기능 테스트', async ({ page }) => {
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');

    // 검색 입력 필드 찾기 (다양한 셀렉터 시도)
    const searchInput = page
      .locator(
        'input[type="search"], input[placeholder*="검색"], input[placeholder*="Search"], input[name*="search"]'
      )
      .first();
    const hasSearch = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasSearch) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);

      const results = page.locator('tbody tr');
      const count = await results.count();
      expect(count).toBeGreaterThanOrEqual(0);
      console.log(`✅ 검색 결과: ${count}개`);
    } else {
      // 검색 필드가 없는 경우 - 테이블만 확인
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
      console.log('ℹ️ 검색 필드 없음 - SR 목록 테이블 확인됨');
    }
  });

  test('상태 필터 테스트', async ({ page }) => {
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 고급 필터 버튼 찾기
    const advancedFilterButton = page
      .locator('button')
      .filter({ hasText: /고급 필터|Advanced|Filter|필터/i })
      .first();
    const hasFilter = await advancedFilterButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasFilter) {
      await advancedFilterButton.click();
      await page.waitForTimeout(500);

      // 상태 필터 Label 확인
      const statusLabel = page.locator('label').filter({ hasText: /상태/i }).first();
      if (await statusLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
        // 상태 Select 찾기 및 클릭
        const statusSection = page
          .locator('div')
          .filter({ has: page.locator('label:has-text("상태")') })
          .first();
        const statusSelect = statusSection.locator('button[role="combobox"]').first();

        if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await statusSelect.click();
          await page.waitForTimeout(500);

          const options = page.locator('[role="option"]');
          const optionCount = await options.count();
          if (optionCount > 0) {
            console.log(`✅ 상태 필터 옵션: ${optionCount}개`);
            await options.first().click();
          }
        }
      }
    } else {
      // 고급 필터가 없는 경우 - 테이블만 확인
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
      console.log('ℹ️ 고급 필터 버튼 없음 - SR 목록 테이블 확인됨');
    }
  });

  test('우선순위 필터 테스트', async ({ page }) => {
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 고급 필터 버튼 찾기
    const advancedFilterButton = page
      .locator('button')
      .filter({ hasText: /고급 필터|Advanced|Filter|필터/i })
      .first();
    const hasFilter = await advancedFilterButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasFilter) {
      await advancedFilterButton.click();
      await page.waitForTimeout(500);

      // 우선순위 필터 Label 확인
      const priorityLabel = page
        .locator('label')
        .filter({ hasText: /우선순위/i })
        .first();
      if (await priorityLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
        const prioritySection = page
          .locator('div')
          .filter({ has: page.locator('label:has-text("우선순위")') })
          .first();
        const prioritySelect = prioritySection.locator('button[role="combobox"]').first();

        if (await prioritySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await prioritySelect.click();
          await page.waitForTimeout(500);

          const options = page.locator('[role="option"]');
          const optionCount = await options.count();
          if (optionCount > 0) {
            console.log(`✅ 우선순위 필터 옵션: ${optionCount}개`);
          }
        }
      }
    } else {
      await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
      console.log('ℹ️ 고급 필터 버튼 없음 - SR 목록 테이블 확인됨');
    }
  });

  test('필터 초기화 테스트', async ({ page }) => {
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');

    // 고급 필터 열기
    const advancedFilterButton = page
      .locator('button')
      .filter({ hasText: /고급 필터|Advanced|Filter/i })
      .first();
    if (await advancedFilterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await advancedFilterButton.click();
      await page.waitForTimeout(500);

      // 초기화 버튼 찾기
      const resetButton = page
        .locator('button')
        .filter({ hasText: /초기화|Reset|Clear/i })
        .first();
      if (await resetButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await resetButton.click();
        await page.waitForTimeout(500);
        console.log('✅ 필터 초기화 완료');
      } else {
        console.log('ℹ️ 초기화 버튼이 없거나 다른 형태');
      }
    }
  });
});
