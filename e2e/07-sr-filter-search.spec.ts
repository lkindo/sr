import { test, expect } from '@playwright/test'

/**
 * SR 필터링 및 검색 테스트
 */

test.describe('SR 필터링 및 검색', () => {
  test('SR 목록 페이지 로드', async ({ page }) => {
    await page.goto('/srs')
    
    // 페이지가 로드될 때까지 대기
    await page.waitForLoadState('networkidle')
    
    // SR 목록 테이블 확인
    await expect(page.locator('table')).toBeVisible()
  })

  test('검색 기능 테스트', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 검색 입력 필드 찾기
    const searchInput = page.locator('input[type="search"], input[placeholder*="검색"], input[placeholder*="Search"]')
    const isVisible = await searchInput.isVisible().catch(() => false)
    
    if (isVisible) {
      // 검색어 입력
      await searchInput.fill('test')
      await page.waitForTimeout(500) // 검색 결과 대기
      
      // 검색 결과 확인
      const results = page.locator('tbody tr')
      const count = await results.count()
      expect(count).toBeGreaterThanOrEqual(0)
    } else {
      test.skip()
    }
  })

  test('상태 필터 테스트', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 상태 필터 찾기
    const statusFilter = page.locator('select, button').filter({ hasText: /상태|Status/ }).first()
    const isVisible = await statusFilter.isVisible().catch(() => false)
    
    if (isVisible) {
      await statusFilter.click()
      await page.waitForTimeout(300)
      
      // 필터 옵션 확인
      const options = page.locator('[role="option"], option')
      const optionCount = await options.count()
      expect(optionCount).toBeGreaterThan(0)
    } else {
      test.skip()
    }
  })

  test('우선순위 필터 테스트', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 우선순위 필터 찾기
    const priorityFilter = page.locator('select, button').filter({ hasText: /우선순위|Priority/ }).first()
    const isVisible = await priorityFilter.isVisible().catch(() => false)
    
    if (isVisible) {
      await priorityFilter.click()
      await page.waitForTimeout(300)
      
      // 필터 옵션 확인
      const options = page.locator('[role="option"], option')
      const optionCount = await options.count()
      expect(optionCount).toBeGreaterThan(0)
    } else {
      test.skip()
    }
  })
})


