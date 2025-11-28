import { test, expect } from '@playwright/test'

/**
 * 기본 페이지 접근 테스트
 */
test.describe('기본 페이지 접근', () => {
  test('로그인 페이지 접근', async ({ page }) => {
    await page.goto('/login')

    // 페이지 로드 확인 - CardTitle은 div로 렌더링됨
    await expect(page.locator('.text-2xl').filter({ hasText: '로그인' })).toBeVisible()
    await expect(page.getByText('SR 관리 시스템에 로그인하세요')).toBeVisible()

    // 폼 요소 확인
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /로그인/ })).toBeVisible()

    // 회원가입 링크 확인
    await expect(page.getByRole('link', { name: '회원가입' })).toBeVisible()
  })

  test('회원가입 페이지 접근', async ({ page }) => {
    await page.goto('/register')

    // 페이지 로드 확인
    await expect(page.locator('.text-2xl').filter({ hasText: '회원가입' })).toBeVisible()
    await expect(page.getByText('새 계정을 만들어 SR 관리 시스템을 사용하세요')).toBeVisible()

    // 폼 요소 확인
    await expect(page.locator('#name')).toBeVisible()
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()

    // 로그인 링크 확인
    await expect(page.locator('a[href="/login"]').filter({ hasText: '로그인' })).toBeVisible()
  })

  test('인증되지 않은 사용자는 대시보드 접근 불가', async ({ page }) => {
    // 새로운 컨텍스트에서 세션 없이 테스트
    const context = await page.context()
    await context.clearCookies()

    await page.goto('/dashboard')

    // 로그인 페이지로 리디렉션 확인
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })
})

