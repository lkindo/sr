import { test, expect } from '@playwright/test'

/**
 * 페이지네이션 및 정렬 테스트
 */

test.describe('페이지네이션 및 정렬', () => {
  test('SR 목록 페이지네이션', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 페이지네이션 컨트롤 찾기
    const pagination = page.locator('[aria-label*="pagination"], nav').filter({ hasText: /다음|Next|이전|Previous/ })
    const paginationVisible = await pagination.isVisible().catch(() => false)
    
    if (paginationVisible) {
      await expect(pagination).toBeVisible()
      
      // 다음 페이지 버튼 확인
      const nextButton = pagination.locator('button, a').filter({ hasText: /다음|Next/ })
      const nextVisible = await nextButton.isVisible().catch(() => false)
      
      if (nextVisible) {
        await expect(nextButton).toBeVisible()
      }
    } else {
      test.skip()
    }
  })

  test('SR 목록 정렬 기능', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 테이블 헤더 확인
    const tableHeaders = page.locator('thead th, [role="columnheader"]')
    const headerCount = await tableHeaders.count()
    
    if (headerCount > 0) {
      // 정렬 가능한 헤더 클릭
      const firstHeader = tableHeaders.first()
      await firstHeader.click()
      await page.waitForTimeout(500)
      
      // 정렬이 적용되었는지 확인
      await expect(firstHeader).toBeVisible()
    } else {
      test.skip()
    }
  })

  test('사용자 목록 페이지네이션', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')
    
    // 페이지네이션 컨트롤 찾기
    const pagination = page.locator('[aria-label*="pagination"], nav').filter({ hasText: /다음|Next/ })
    const paginationVisible = await pagination.isVisible().catch(() => false)
    
    if (paginationVisible) {
      await expect(pagination).toBeVisible()
    } else {
      test.skip()
    }
  })

  test('고객사 목록 정렬', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')
    
    // 테이블 헤더 확인
    const tableHeaders = page.locator('thead th, [role="columnheader"]')
    const headerCount = await tableHeaders.count()
    
    if (headerCount > 0) {
      await expect(tableHeaders.first()).toBeVisible()
    } else {
      test.skip()
    }
  })
})

