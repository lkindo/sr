import { expect, Page, test } from '@playwright/test';

import { PERSONA_AUTH_FILES } from '../helpers/auth-helpers';

/**
 * 역할별 상단 네비게이션 스펙.
 *
 * 이 파일이 생긴 이유: ADMIN 으로 로그인해도 '조직 관리'·'권한 관리' 메뉴가 통째로
 * 사라진 채 운영에 배포됐고, E2E 는 전부 녹색이었다. 기존 스펙은 전부
 * `page.goto('/organization')` 으로 직행해서 **메뉴를 거쳐 도달하는 경로가 한 줄도
 * 없었기 때문**이다. 페이지는 멀쩡했고 거기로 가는 문이 없었을 뿐이라, 어느 스펙도
 * 눈치채지 못했다.
 *
 * 원인은 루트 레이아웃이 `SessionProvider` 에 초기 세션을 안 넘긴 것이었다.
 * 클라이언트가 빈 세션으로 시작하니 권한 기반 UI 가 전부 "권한 없음"으로 그려졌다.
 * 유닛 테스트는 그 배선을 고정하지만, 실제 브라우저에서 로그인한 사용자가
 * 메뉴를 보는지까지는 확인하지 못한다 — 그래서 여기서 확인한다.
 *
 * 네비게이션 항목은 `src/config/navigation.ts` 의 roles 필드를 따른다.
 */

/**
 * 데스크톱 상단 네비게이션(`<nav aria-label="주 메뉴">`)의 링크 텍스트.
 * 이름으로 집는다 — 헤더에는 '사용자 메뉴' nav 도 있고 사이드바에도 nav 가 있어서
 * 위치(`.first()`)로 집으면 레이아웃이 조금만 바뀌어도 엉뚱한 걸 검사하게 된다.
 * 모바일 시트에도 같은 라벨의 링크가 들어가므로 데스크톱 nav 안으로 범위를 좁힌다.
 */
const mainNav = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' });

const mainNavLabels = async (page: Page): Promise<string[]> => {
  const nav = mainNav(page);
  await expect(nav).toBeVisible();
  return (await nav.getByRole('link').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
};

test.describe('ADMIN 상단 네비게이션', () => {
  test.use({ storageState: PERSONA_AUTH_FILES.admin });

  test('내부 메뉴가 첫 렌더부터 보이고, 클릭으로 실제 페이지에 도달한다', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // 세션이 서버에서 심어지므로 클라이언트 세션을 기다리지 않아도 보여야 한다.
    // `/api/auth/session` 왕복을 기다려야만 통과한다면 그게 바로 회귀다.
    const labels = await mainNavLabels(page);
    expect(labels).toEqual(expect.arrayContaining(['조직 관리', '권한 관리']));

    // 메뉴가 존재하는 것과 실제로 데려다주는 것은 다른 문제다.
    await mainNav(page).getByRole('link', { name: '조직 관리' }).click();
    await expect(page).toHaveURL(/\/organization/);
  });

  /**
   * 위 테스트만으로는 회귀를 못 잡는다.
   *
   * `ClientLayout` 이 `SessionProvider` 에 서버 세션을 넘기므로 클라이언트 세션은 첫 렌더부터
   * 이미 채워져 있고, `/api/auth/session` 왕복은 아예 일어나지 않는다(next-auth 는 초기 세션이
   * 있으면 마운트 시 fetch 를 건너뛴다). 그래서 Header 가 서버 props 를 무시하고 `hasAnyRole()`
   * 같은 세션 전용 훅으로 되돌아가도 첫 화면은 똑같이 그려지고 테스트는 초록불이 된다.
   * 실제로 그 결함을 심어 확인했다 — 위 테스트는 통과했다.
   *
   * 두 경로(서버 props / 클라이언트 세션)가 갈리는 지점은 **클라이언트 세션이 사라졌을 때**다.
   * 세션 엔드포인트 장애·만료·오프라인에서 실제로 일어나며, 그때 서버가 이미 알고 있는 역할로
   * 메뉴를 지켜 내는 것이 이 파일이 지키려는 계약이다.
   */
  test('클라이언트 세션이 끊겨도 서버가 내려준 역할로 메뉴를 유지한다', async ({ page }) => {
    // 사이드바가 있는 화면이어야 한다. Sidebar 는 /dashboard 에서 null 을 반환한다.
    await page.goto('/organization', { waitUntil: 'load' });

    const nav = mainNav(page);
    // 사이드바는 서버 props 없이 `usePermissions()`(클라이언트 세션)만 본다.
    // 그래서 "세션이 실제로 비었는지"를 알려 주는 관측점으로 쓸 수 있다.
    const sidebar = page.getByRole('navigation', { name: '사이드바 메뉴' });

    await expect(nav.getByRole('link', { name: '조직 관리' })).toBeVisible();
    await expect(sidebar.getByRole('link').first()).toBeVisible();
    // 위 링크들은 서버 HTML에도 있어 수화 완료의 증거가 아니다. 사용자 메뉴 버튼은
    // 클라이언트 세션이 붙어야 렌더되므로, 이 양성 조건 뒤에만 visibilitychange를 보낸다.
    await expect(page.getByRole('button', { name: '사용자 메뉴' })).toBeVisible({
      timeout: 30000,
    });

    // 세션 엔드포인트가 "세션 없음"을 돌려주는 상황. 실제 응답도 이 형태다(200 + `null`).
    await page.route('**/api/auth/session', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    );

    // refetchOnWindowFocus 경로를 깨워 세션을 다시 읽게 한다.
    //
    // 한 번만 쏘면 안 된다. 이벤트 리스너는 하이드레이션이 끝나야 붙는데 사이드바·상단 메뉴는
    // 서버 렌더 결과라 하이드레이션 전에도 이미 보인다. 즉 "보인다"는 하이드레이션 완료의
    // 증거가 못 된다. 게다가 next-auth 는 마지막 동기화 시각을 초 단위로 비교해 같은 초 안의
    // 재조회를 억제한다. 두 이유 모두 단발 발사를 조용히 삼키므로, 세션이 실제로 비워질
    // 때까지 반복해서 깨운다.
    //
    // 사이드바는 서버 props 없이 클라이언트 세션만 보므로, 여기가 비는 것이
    // "클라이언트 세션이 사라졌다"의 관측 증거다. 이 대기가 없으면 아래 단언이
    // 세션이 사라지기 전에 통과해 결함을 놓친다.
    await expect
      .poll(
        async () => {
          await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
          return sidebar.getByRole('link').count();
        },
        {
          timeout: 30000,
          message: '클라이언트 세션이 비워지지 않아 이 테스트가 아무것도 검증하지 못했다',
        }
      )
      .toBe(0);

    // 여기서부터가 본론이다. 서버 레이아웃이 이미 역할을 내려줬으므로 상단 메뉴는 남아야 한다.
    await expect(nav.getByRole('link', { name: '조직 관리' })).toBeVisible();
    await expect(nav.getByRole('link', { name: '권한 관리' })).toBeVisible();
  });
});

test.describe('CLIENT_ADMIN 상단 네비게이션', () => {
  test.use({ storageState: PERSONA_AUTH_FILES.clientAdmin });

  test('내부 전용 메뉴는 노출하지 않는다', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const labels = await mainNavLabels(page);
    expect(labels).not.toContain('조직 관리');
    expect(labels).not.toContain('권한 관리');
  });
});
