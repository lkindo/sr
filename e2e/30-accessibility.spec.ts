import { expect, test } from '@playwright/test';

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
        // h1 이 렌더될 때까지 기다린다. 이 페이지의 로딩 스켈레톤(loading.tsx)에는
        // h1 이 없어서, 넘기지 않으면 axe 가 스켈레톤을 검사하고
        // `page-has-heading-one` 을 가짜로 신고한다. 헬퍼 주석이 예고한 실패다.
        await checkA11y(page, 'Dashboard', 'h1');
      });
    });

    test('SR 목록 페이지 접근성 확인', async ({ browser }) => {
      await withAuthContext(browser, 'manager', async (page) => {
        await page.goto('/srs');
        // h1 이 렌더될 때까지 기다린다. 이 페이지의 로딩 스켈레톤(loading.tsx)에는
        // h1 이 없어서, 넘기지 않으면 axe 가 스켈레톤을 검사하고
        // `page-has-heading-one` 을 가짜로 신고한다. 헬퍼 주석이 예고한 실패다.
        await checkA11y(page, 'SR List', 'h1');
      });
    });

    /**
     * 목록을 **기본 데이터로만** 검사하면 조건부로만 나타나는 UI 가 통째로 빠진다.
     *
     * 실제로 그랬다. 페이지네이션 컨트롤은 총 페이지가 2 이상일 때만 렌더되는데,
     * 시드 SR 3건 + 기본 20건/페이지에서는 절대 나타나지 않는다. 그래서 그 안의
     * `<ul>` 직계 `<div>`(axe list/only-listitems, serious)가 오래 숨어 있었고,
     * E2E 잔여 SR 이 쌓여 페이지가 2쪽이 된 날에야 우연히 드러났다.
     * 즉 이 검사 결과가 **데이터 구성에 따라 달라지고 있었다.**
     *
     * itemsPerPage=1 로 페이지 수를 강제해 그 조건을 데이터와 무관하게 고정한다.
     * (pageSize 는 1~100 이면 되고, 목록 화면의 선택지 5종에 없어도 URL 로는 통한다 —
     *  src/lib/pagination.ts 의 z.number().int().positive().max(100))
     */
    test('SR 목록 페이지 접근성 확인 (페이지네이션 표시 상태)', async ({ browser }) => {
      await withAuthContext(browser, 'manager', async (page) => {
        await page.goto('/srs?itemsPerPage=1');
        await checkA11y(page, 'SR List (paginated)', 'nav[aria-label="페이지 탐색"]');
      });
    });

    test('SR 상세 페이지 접근성 확인', async ({ browser }) => {
      // 매니저 권한으로 첫 번째 SR 상세 페이지 접근
      await withAuthContext(browser, 'manager', async (page) => {
        await page.goto('/srs', { waitUntil: 'domcontentloaded' });

        // 시드가 SR 3건을 넣으므로 목록에 링크가 없으면 그것이 회귀다.
        // 예전에는 링크를 못 찾으면 경고만 찍고 통과해서, 목록이 비어도 —
        // 즉 상세 접근성을 한 번도 검사하지 못해도 — 초록불이었다.
        const firstSRLink = page.locator('tr a').first();
        await expect(firstSRLink, 'SR 목록에 상세 링크가 없습니다.').toBeVisible({
          timeout: 15000,
        });

        await firstSRLink.click();
        await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/);
        // 상세 데이터가 렌더된 뒤에 검사한다. 스켈레톤을 검사하면 h1 이 없다고 나온다.
        await checkA11y(page, 'SR Detail', '[data-testid="sr-title"]');
      });
    });
  });
});
