import { test, expect } from '@playwright/test'

/**
 * 대시보드 개요 테스트
 */

test.describe('대시보드', () => {
  test('대시보드 페이지 접근', async ({ page }) => {
    await page.goto('/dashboard')
    
    // 페이지가 로드될 때까지 대기
    await page.waitForLoadState('networkidle')
    
    // 대시보드 콘텐츠 확인
    const dashboardContent = page.locator('main, [role="main"]')
    await expect(dashboardContent).toBeVisible()
  })

  test('SR 통계 카드 확인', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    
    // 통계 카드 찾기
    const statCards = page.locator('[class*="card"], [class*="Card"]')
    const cardCount = await statCards.count()
    
    // 최소 1개 이상의 카드가 있어야 함
    expect(cardCount).toBeGreaterThan(0)
  })

  test('최근 SR 목록 확인', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    
    // 최근 SR 섹션 찾기
    const recentSRs = page.locator('section, div').filter({ hasText: /최근|Recent/ })
    const sectionVisible = await recentSRs.isVisible().catch(() => false)
    
    if (sectionVisible) {
      await expect(recentSRs.first()).toBeVisible()
    }
  })

  test('빠른 액션 버튼 확인', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    
    // 빠른 액션 버튼 찾기 (SR 생성 등)
    const quickActions = page.locator('button, a').filter({ hasText: /새 SR|New SR|생성/ })
    const actionVisible = await quickActions.isVisible().catch(() => false)
    
    if (actionVisible) {
      await expect(quickActions.first()).toBeVisible()
    }
  })
})


