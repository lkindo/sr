import { expect, test } from '@playwright/test';

/**
 * 라우트 스모크 — "이 화면이 실제 콘텐츠까지 렌더되는가" 를 한 곳에서 확인한다.
 *
 * 이 파일이 생긴 이유: 같은 단언이 스위트 전체에 21번 흩어져 있었다.
 *   SR 목록      03-1 / 03-3 / 07-1 / sr-permissions-1
 *   대시보드     14-1 / 14-4 / 14-5 / 14-6
 *   설정         16-1 / 26-1 / 26-2 / 26-5
 *   사용자 목록  08-1 / 15-3
 *   고객사 목록  09-1 / 15-4
 *   조직도       24-1 ⊂ 24-2
 * 전부 "페이지가 열리는가" 만 보는데, 그중 다수는 `main` 이 보이는지만 확인해서
 * 로딩 스켈레톤 상태에서도 통과했다. 화면이 비어 있어도 초록불이었다는 뜻이다.
 *
 * 그래서 여기서는 **콘텐츠 앵커**(그 화면에만 있는 heading)까지 도달했는지를 단언한다.
 * 스켈레톤에는 이 heading 이 없으므로 "열렸다" 와 "그려졌다" 가 구분된다.
 *
 * 역할별 경계(ENGINEER 에게 무엇이 보이는가 등)는 여기서 다루지 않는다.
 * 그건 e2e/roles/ 의 몫이다 — 이 파일은 ADMIN 세션으로 "모든 화면이 살아 있는가" 만 본다.
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. "500ms 동안 네트워크 요청 0건" 이 성립하지 않으므로 항상 타임아웃난다.
 */

/** 인증이 필요한 화면과, 그 화면이 실제로 그려졌음을 증명하는 앵커. */
const AUTHENTICATED_ROUTES = [
  { path: '/dashboard', anchor: '대시보드' },
  { path: '/srs', anchor: 'SR 목록' },
  { path: '/my-requests', anchor: '내 요청 SR' },
  { path: '/users', anchor: '사용자 목록' },
  { path: '/clients', anchor: '고객사 목록' },
  { path: '/roles', anchor: '역할 목록' },
  { path: '/organization', anchor: '조직 구조' },
  { path: '/settings/profile', anchor: '프로필' },
  { path: '/settings/notifications', anchor: '알림 설정' },
  { path: '/settings/system', anchor: '시스템 설정' },
] as const;

test.describe('라우트 스모크 (ADMIN)', () => {
  for (const { path, anchor } of AUTHENTICATED_ROUTES) {
    test(`${path} 가 콘텐츠까지 렌더된다`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });

      // 서버가 500 을 주면 화면에는 에러 바운더리가 뜨고 heading 단언이
      // "요소가 없다" 로 실패한다. 그러면 원인이 라우트 오류인지 렌더 지연인지
      // 구분이 안 되므로 상태 코드를 먼저 확정한다.
      expect(response?.status(), `${path} 응답 상태`).toBeLessThan(400);

      // 앵커는 heading 역할로 겨냥한다. 태그 레벨(h1/h2/h3)은 화면마다 다르고
      // 리팩터링으로 바뀌지만, "이 화면의 제목" 이라는 의미는 바뀌지 않는다.
      await expect(
        page.getByRole('heading', { name: anchor, exact: true }),
        `${path} 의 앵커 "${anchor}" 가 보이지 않는다 — 스켈레톤에서 멈췄거나 라우트가 깨졌다.`
      ).toBeVisible({ timeout: 20000 });
    });
  }

  test('/settings 는 프로필로 리디렉션된다', async ({ page }) => {
    // src/app/(dashboard)/settings/page.tsx 는 redirect('/settings/profile') 뿐이다.
    // 예전 26-1 은 `expect(page.url()).toMatch(/\/(settings|profile)/)` 이라
    // 리디렉션이 사라져도(= /settings 에 머물러도) 통과했다.
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/settings\/profile$/);
  });
});

test.describe('라우트 스모크 (비인증)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // 보호 라우트 전체가 아니라 대표 3개만 확인한다. 가드는 src/auth.config.ts 의
  // authorized() 한 곳에서 걸리므로 라우트마다 반복해도 같은 코드를 다시 볼 뿐이다.
  for (const path of ['/dashboard', '/srs', '/users']) {
    test(`${path} 는 미인증 시 로그인으로 보낸다`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
