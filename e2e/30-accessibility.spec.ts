import { test } from '@playwright/test';

import { checkA11y, withAuthContext } from './helpers/test-helpers';

/**
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. 그래서 "500ms 동안 네트워크 요청 0건"이라는 networkidle 조건은
 * 영원히 성립하지 않고 waitForLoadState('networkidle') 는 항상 30초 뒤 타임아웃난다.
 * 로드 대기는 checkA11y(helpers/test-helpers.ts)가 'load' 로 처리한다.
 * 여기서는 클릭 대상 요소가 나타나는 것만 기다린다
 * (isVisible() 은 대기하지 않고 즉시 반환하므로 waitFor 가 필요하다).
 */

test.describe('Accessibility (A11y) 검증', () => {
  // 로그인·회원가입 페이지는 익명 상태에서만 렌더된다. chromium 프로젝트의 기본
  // storageState 는 로그인된 세션이라, 그대로 두면 authorized() 가 /dashboard 로
  // 리다이렉트해 엉뚱한 페이지의 접근성을 검사하게 된다.
  test.describe('비인증 페이지 접근성 확인', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('로그인 페이지 접근성 확인', async ({ page }) => {
      await page.goto('/login');
      await checkA11y(page, 'Login Page');
    });

    test('회원가입 페이지 접근성 확인', async ({ page }) => {
      await page.goto('/register');
      await checkA11y(page, 'Register Page');
    });
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
        await page.goto('/srs', { waitUntil: 'domcontentloaded' });

        const firstSRLink = page.locator('tr a').first();
        // SR 링크가 나타날 때까지 기다린다. 없으면 아래 else 로 건너뛴다(기존 동작 유지).
        await firstSRLink.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
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
