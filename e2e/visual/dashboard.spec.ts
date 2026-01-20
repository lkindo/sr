import { expect, test } from '@playwright/test';

import { checkPerformance, withAuthContext } from '../helpers/test-helpers';

test.describe('Dashboard Visual & Performance', () => {
  test('Real Dashboard Layout should look correct', async ({ browser }) => {
    await withAuthContext(browser, 'manager', async (page) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // 스크롤 대기 및 애니메이션 완료 대기
      await page.waitForTimeout(1000);

      // 전체 페이지 스크린샷 비교
      await expect(page).toHaveScreenshot('full-dashboard.png', { fullPage: true });

      // 성능 체크 (대시보드 로딩 3초 이내)
      await checkPerformance(page, 3000);
    });
  });

  test('StatsCard Default should look correct', async ({ page }) => {
    // Access Storybook iframe directly to isolate component
    await page.goto(
      'http://localhost:6006/iframe.html?id=dashboard-statscard--default&viewMode=story'
    );

    // Wait for component to render
    await page.waitForSelector('text=Total Users');

    // Take screenshot and compare
    await expect(page).toHaveScreenshot('statscard-default.png');
  });

  test('StatsCard Positive Trend should look correct', async ({ page }) => {
    await page.goto(
      'http://localhost:6006/iframe.html?id=dashboard-statscard--positive-trend&viewMode=story'
    );
    await page.waitForSelector('text=Active Now');
    await expect(page).toHaveScreenshot('statscard-positive-trend.png');
  });

  test('StatsCard Overflow Text Defense', async ({ page }) => {
    const longText = 'This is a very long title that should be truncated...';
    const encodedTitle = encodeURIComponent(longText);

    await page.goto(
      `http://localhost:6006/iframe.html?id=dashboard-statscard--default&args=title:${encodedTitle}&viewMode=story`
    );

    await expect(page).toHaveScreenshot('statscard-overflow.png');
  });
});
