import { test, expect } from '@playwright/test'

/**
 * SR 목록 관리 테스트
 * 주의: 이 테스트를 실행하기 전에 로그인이 필요합니다.
 */

// 로그인 헬퍼 함수
async function login(page: any) {
  await page.goto('/login')
  await page.fill('#email', process.env.TEST_USER_EMAIL || 'admin@example.com')
  await page.fill('#password', process.env.TEST_USER_PASSWORD || 'admin123')
  await page.click('button[type="submit"]')
  
  // 로그인 성공 확인 - 대시보드로 이동
  await page.waitForURL('/dashboard', { timeout: 15000 })
}

test.describe('SR 목록 관리', () => {
  // NOTE: Global setup을 통해 로그인 상태가 자동으로 로드됩니다.
  // playwright/.auth/user.json에 저장된 인증 상태 사용

  test('SR 목록 페이지 접근', async ({ page }) => {
    // SR 목록 페이지로 이동
    await page.goto('/srs')
    
    // 페이지가 로드될 때까지 대기
    await page.waitForLoadState('domcontentloaded')
    
    // 테이블 확인
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
  })

  test('SR 필터링', async ({ page }) => {
    await page.goto('/srs')
    
    // 상태 필터 확인
    const statusFilter = page.locator('select, [role="combobox"]').first()
    if (await statusFilter.isVisible()) {
      await statusFilter.click()
      // 필터 옵션이 표시되는지 확인
      await expect(page.locator('text=전체')).toBeVisible()
    }
  })

  test('SR 목록 로딩 상태', async ({ page }) => {
    await page.goto('/srs')
    
    // 페이지 로드 대기
    await page.waitForLoadState('domcontentloaded')
    
    // 테이블이 표시되는지 확인
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
  })

  test('빈 SR 목록 처리', async ({ page }) => {
    // 필터를 설정하여 결과가 없는 경우를 시뮬레이션
    await page.goto('/srs?status=INVALID_STATUS')
    
    // 페이지 로드 대기
    await page.waitForLoadState('domcontentloaded')
    
    // 테이블은 여전히 표시되어야 함 (빈 테이블)
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
  })
})

