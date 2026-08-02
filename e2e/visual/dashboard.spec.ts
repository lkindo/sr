import { expect, test } from '@playwright/test';

import { checkPerformance, withAuthContext } from '../helpers/test-helpers';

test.describe('Dashboard Visual & Performance', () => {
  test('Real Dashboard Layout should look correct', async ({ browser }) => {
    await withAuthContext(browser, 'manager', async (page) => {
      await page.goto('/dashboard');
      // ⚠️ networkidle 금지: 루트 레이아웃이 /api/realtime SSE 스트림을 계속 열어 두므로
      // networkidle 은 성립하지 않고 30초 타임아웃난다.
      // 스크린샷 비교에는 번들·이미지까지 로드된 상태가 필요하므로 'load' 를 쓴다
      // (domcontentloaded 는 async 스크립트를 기다리지 않아 하이드레이션 전 DOM 을 찍을 수 있다).
      await page.waitForLoadState('load');

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
