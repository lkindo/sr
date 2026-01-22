import { expect, test } from '@playwright/test';

/**
 * 기본 페이지 접근 테스트
 */
test.describe('기본 페이지 접근', () => {
  // 기본 global-setup에서 이미 로그인된 상태(storageState)이므로,
  // 로그인/회원가입 페이지 자체를 테스트하기 위해 세션 정보를 초기화합니다.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('로그인 페이지 접근', async ({ page }) => {
    await page.goto('/login');

    // 페이지 로드 확인 - CardTitle은 div로 렌더링됨
    await expect(page.locator('.text-2xl').filter({ hasText: '로그인' })).toBeVisible();
    await expect(page.getByText('SR 관리 시스템에 로그인하세요')).toBeVisible();

    // 폼 요소 확인
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /로그인/ })).toBeVisible();

    // 회원가입 링크 확인
    await expect(page.getByRole('link', { name: '회원가입' })).toBeVisible();
  });

  test('회원가입 페이지 접근', async ({ page }) => {
    await page.goto('/register');

    // 페이지 로드 확인
    await expect(page.locator('.text-2xl').filter({ hasText: '회원가입' })).toBeVisible();
    await expect(page.getByText('새 계정을 만들어 SR 관리 시스템을 사용하세요')).toBeVisible();

    // 폼 요소 확인
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();

    // 로그인 링크 확인
    await expect(page.locator('a[href="/login"]').filter({ hasText: '로그인' })).toBeVisible();
  });

  test('인증되지 않은 사용자는 대시보드 접근 불가', async ({ page }) => {
    // 세션이 없는 상태에서 보호된 페이지 접근
    await page.goto('/dashboard');

    // 로그인 페이지로 리디렉션되어야 함
    await expect(page).toHaveURL(/\/login/);
    console.log('✅ 미인증 사용자 리디렉션 확인');
  });
});
