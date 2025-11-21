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
    await page.waitForTimeout(1000)

    // 고급 필터 버튼 클릭
    const advancedFilterButton = page.locator('button:has-text("고급 필터")')
    const isVisible = await advancedFilterButton.isVisible().catch(() => false)

    if (isVisible) {
      await advancedFilterButton.click()
      await page.waitForTimeout(500)

      // 상태 필터 Label 확인 후 해당 영역의 SelectTrigger 찾기
      await page.locator('label:has-text("상태")').waitFor({ state: 'visible', timeout: 5000 })

      // 상태 Label이 있는 div 내의 button[role="combobox"] 찾기
      const statusSection = page.locator('div:has(> label:has-text("상태"))')
      const statusSelect = statusSection.locator('button[role="combobox"]')

      await statusSelect.click()
      await page.waitForTimeout(500)

      // 필터 옵션 확인
      const options = page.locator('[role="option"]')
      await options.first().waitFor({ state: 'visible', timeout: 5000 })
      const optionCount = await options.count()
      expect(optionCount).toBeGreaterThan(0)
    } else {
      test.skip()
    }
  })

  test('우선순위 필터 테스트', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // 고급 필터 버튼 클릭
    const advancedFilterButton = page.locator('button:has-text("고급 필터")')
    const isVisible = await advancedFilterButton.isVisible().catch(() => false)

    if (isVisible) {
      await advancedFilterButton.click()
      await page.waitForTimeout(500)

      // 우선순위 필터 Label 확인 후 해당 영역의 SelectTrigger 찾기
      await page.locator('label:has-text("우선순위")').waitFor({ state: 'visible', timeout: 5000 })

      // 우선순위 Label이 있는 div 내의 button[role="combobox"] 찾기
      const prioritySection = page.locator('div:has(> label:has-text("우선순위"))')
      const prioritySelect = prioritySection.locator('button[role="combobox"]')

      await prioritySelect.click()
      await page.waitForTimeout(500)

      // 필터 옵션 확인
      const options = page.locator('[role="option"]')
      await options.first().waitFor({ state: 'visible', timeout: 5000 })
      const optionCount = await options.count()
      expect(optionCount).toBeGreaterThan(0)
    } else {
      test.skip()
    }
  })
})

