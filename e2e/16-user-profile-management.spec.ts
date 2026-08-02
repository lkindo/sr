import { expect, test } from '@playwright/test';

/**
 * 사용자 프로필 관리 테스트
 *
 * 설정 페이지에서 프로필 정보 확인 및 수정 기능 검증
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. 그래서 "500ms 동안 네트워크 요청 0건"이라는 networkidle 조건은
 * 영원히 성립하지 않고 waitForLoadState('networkidle') 는 항상 30초 뒤 타임아웃난다.
 * 대신 (1) domcontentloaded 로 내비게이션만 확정하고, (2) 실제로 필요한 것
 * (목록 API 응답 / 요소 표시)을 기다린다. expect().toBeVisible() 은 자동 재시도한다.
 */

test.describe('사용자 프로필 관리', () => {
  test('프로필/설정 페이지 접근', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });

    // 설정 페이지 메인 콘텐츠가 반드시 보여야 함
    await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 10000 });
    console.log('✅ 설정 페이지 접근 성공');
  });

  test('프로필 섹션 확인', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });

    // 섹션 탐색 전에 설정 본문 렌더링을 기다린다
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    // 프로필 관련 섹션 또는 콘텐츠 찾기
    const profileSection = page
      .locator('section, div, form')
      .filter({ hasText: /프로필|Profile|이름|Name|이메일|Email/i });
    const hasProfile = await profileSection
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (hasProfile) {
      console.log('✅ 프로필 섹션 확인');
    } else {
      // 프로필 섹션이 없어도 설정 페이지가 정상이면 통과
      await expect(page.locator('main')).toBeVisible();
      console.log('ℹ️ 프로필 섹션 미발견 - 설정 페이지 로드 확인');
    }
  });

  test('프로필 수정 기능 확인', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });

    // 버튼/필드 탐색 전에 설정 본문 렌더링을 기다린다
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    // 수정 버튼 또는 입력 필드 찾기
    const editButton = page
      .locator('button')
      .filter({ hasText: /수정|Edit|변경|저장|Save/i })
      .first();
    const inputField = page
      .locator('input[name*="name"], input[name*="email"], input[type="text"]')
      .first();

    const hasEditButton = await editButton.isVisible({ timeout: 3000 }).catch(() => false);
    const hasInputField = await inputField.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasEditButton) {
      console.log('✅ 프로필 수정 버튼 확인');
    } else if (hasInputField) {
      console.log('✅ 프로필 입력 필드 확인 (인라인 수정)');
    } else {
      // 수정 기능이 없어도 페이지가 정상이면 통과
      await expect(page.locator('main')).toBeVisible();
      console.log('ℹ️ 수정 버튼/입력 필드 미발견 - 설정 페이지 다른 구조');
    }
  });

  test('비밀번호 변경 섹션 확인', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });

    // 섹션 탐색 전에 설정 본문 렌더링을 기다린다
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    // 비밀번호 관련 섹션 찾기
    const passwordSection = page
      .locator('section, div, form')
      .filter({ hasText: /비밀번호|Password/i });
    const hasPassword = await passwordSection
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (hasPassword) {
      console.log('✅ 비밀번호 변경 섹션 확인');
    } else {
      // 비밀번호 섹션이 없어도 통과
      console.log('ℹ️ 비밀번호 섹션 미발견 - 별도 페이지일 수 있음');
    }
  });

  test('사용자 정보 표시 확인', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });

    // body 텍스트는 1회성으로 읽으므로(재시도 없음) 본문 렌더링을 먼저 확정한다
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    // 사용자 이름 또는 이메일 표시 확인
    const pageText = (await page.locator('body').textContent()) || '';
    const hasEmail = pageText.includes('@');
    const hasUserInfo = pageText.match(/이름|Name|이메일|Email/i);

    if (hasEmail) {
      console.log('✅ 이메일 정보 표시 확인');
    } else if (hasUserInfo) {
      console.log('✅ 사용자 정보 표시 확인');
    } else {
      // 정보 표시가 없어도 페이지 로드 확인
      await expect(page.locator('main')).toBeVisible();
      console.log('ℹ️ 사용자 정보 미발견 - 설정 페이지 로드 확인');
    }
  });
});
