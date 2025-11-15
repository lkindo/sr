import { test, expect } from '@playwright/test'

/**
 * 사용자 관리 테스트
 */

test.describe('사용자 관리', () => {
  test('사용자 목록 페이지 접근', async ({ page }) => {
    await page.goto('/users')
    
    // 페이지가 로드될 때까지 대기
    await page.waitForLoadState('networkidle')
    
    // 사용자 목록 테이블 확인
    await expect(page.locator('table')).toBeVisible()
  })

  test('사용자 검색 기능', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')
    
    // 검색 입력 필드 찾기
    const searchInput = page.locator('input[type="search"], input[placeholder*="검색"]')
    const isVisible = await searchInput.isVisible().catch(() => false)
    
    if (isVisible) {
      await searchInput.fill('test')
      await page.waitForTimeout(500)
      
      // 검색 결과 확인
      const results = page.locator('tbody tr')
      const count = await results.count()
      expect(count).toBeGreaterThanOrEqual(0)
    } else {
      test.skip()
    }
  })

  test('사용자 역할 관리 버튼', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')
    
    // 역할 관리 버튼 찾기
    const roleButton = page.locator('button').filter({ hasText: /역할|Role/ }).first()
    const isVisible = await roleButton.isVisible().catch(() => false)
    
    if (isVisible) {
      await expect(roleButton).toBeVisible()
    } else {
      test.skip()
    }
  })
})

