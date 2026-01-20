import { test } from '@playwright/test';

import { checkA11y, withAuthContext } from './helpers/test-helpers';

test.describe('Accessibility (A11y) 검증', () => {
  test('로그인 페이지 접근성 확인', async ({ page }) => {
    await page.goto('/login');
    await checkA11y(page, 'Login Page');
  });

  test('회원가입 페이지 접근성 확인', async ({ page }) => {
    await page.goto('/register');
    await checkA11y(page, 'Register Page');
  });

  test.describe('인증된 페이지 접근성 확인', () => {
    test('대시보드 페이지 접근성 확인', async ({ browser }) => {
      await withAuthContext(browser, 'manager', async (page) => {
        await page.goto('/dashboard');
        await checkA11y(page, 'Dashboard');
      });
    });

    test('SR 목록 페이지 접근성 확인', async ({ browser }) => {
      await withAuthContext(browser, 'manager', async (page) => {
        await page.goto('/srs');
        await checkA11y(page, 'SR List');
      });
    });

    test('SR 상세 페이지 접근성 확인', async ({ browser }) => {
      // 매니저 권한으로 첫 번째 SR 상세 페이지 접근
      await withAuthContext(browser, 'manager', async (page) => {
        await page.goto('/srs');
        await page.waitForLoadState('networkidle');

        const firstSRLink = page.locator('tr a').first();
        if (await firstSRLink.isVisible()) {
          await firstSRLink.click();
          await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/);
          await checkA11y(page, 'SR Detail');
        } else {
          console.warn('⚠️ 테스트할 SR이 없어 상세 페이지 접근성 테스트를 건너뜁니다.');
        }
      });
    });
  });
});
