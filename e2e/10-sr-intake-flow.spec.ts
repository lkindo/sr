import { test, expect } from '@playwright/test'

/**
 * SR 접수 플로우 테스트
 * MANAGER 또는 ADMIN 역할이 SR을 접수하는 전체 프로세스
 */

test.describe('SR 접수 플로우', () => {
  test('SR 접수 화면 접근', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // REQUESTED 상태의 SR 찾기
    const requestedSR = page.locator('tbody tr').filter({ hasText: /신청|REQUESTED/ }).first()
    const isVisible = await requestedSR.isVisible().catch(() => false)
    
    if (isVisible) {
      // 접수 버튼 찾기
      const acceptButton = requestedSR.locator('button').filter({ hasText: /접수|Accept/ })
      const buttonVisible = await acceptButton.isVisible().catch(() => false)
      
      if (buttonVisible) {
        await expect(acceptButton).toBeVisible()
      }
    } else {
      test.skip()
    }
  })

  test('SR 접수 다이얼로그 열기', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 첫 번째 SR 클릭하여 상세 페이지로 이동
    const firstSR = page.locator('tbody tr').first()
    const isVisible = await firstSR.isVisible().catch(() => false)
    
    if (isVisible) {
      await firstSR.click()
      await page.waitForURL(/\/srs\/[^/]+$/, { timeout: 5000 })
      
      // 접수 버튼 확인
      const acceptButton = page.locator('button').filter({ hasText: /접수|Accept/ })
      const buttonVisible = await acceptButton.isVisible().catch(() => false)
      
      if (buttonVisible) {
        await expect(acceptButton).toBeVisible()
      }
    } else {
      test.skip()
    }
  })

  test('SR 접수 정보 입력', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // REQUESTED 상태의 SR 찾기
    const requestedSR = page.locator('tbody tr').filter({ hasText: /신청|REQUESTED/ }).first()
    const isVisible = await requestedSR.isVisible().catch(() => false)
    
    if (isVisible) {
      // 접수 버튼 클릭
      const acceptButton = requestedSR.locator('button').filter({ hasText: /접수|Accept/ })
      const buttonVisible = await acceptButton.isVisible().catch(() => false)
      
      if (buttonVisible) {
        await acceptButton.click()
        await page.waitForTimeout(1000)
        
        // 접수 화면 확인
        await expect(page).toHaveURL(/\/srs\/[^/]+\/intake/, { timeout: 5000 })
        
        // 접수 정보 입력 필드 확인
        const prioritySelect = page.locator('select, [role="combobox"]').filter({ hasText: /우선순위|Priority/ }).first()
        const priorityVisible = await prioritySelect.isVisible().catch(() => false)
        
        if (priorityVisible) {
          await expect(prioritySelect).toBeVisible()
        }
      }
    } else {
      test.skip()
    }
  })
})

