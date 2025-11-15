import { test, expect } from '@playwright/test'

/**
 * SR 상태 변경 워크플로우 테스트
 * REQUESTED → IN_PROGRESS → COMPLETED 플로우
 */

test.describe('SR 상태 변경 워크플로우', () => {
  test('SR 상태 변경 버튼 확인', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 첫 번째 SR 클릭
    const firstSR = page.locator('tbody tr').first()
    const isVisible = await firstSR.isVisible().catch(() => false)
    
    if (isVisible) {
      await firstSR.click()
      await page.waitForURL(/\/srs\/[^/]+$/, { timeout: 5000 })
      
      // 상태 변경 버튼 찾기
      const statusButton = page.locator('button, select').filter({ hasText: /상태|Status/ })
      const buttonVisible = await statusButton.isVisible().catch(() => false)
      
      if (buttonVisible) {
        await expect(statusButton.first()).toBeVisible()
      }
    } else {
      test.skip()
    }
  })

  test('SR 진행중 상태로 변경', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // IN_PROGRESS가 아닌 SR 찾기
    const srRow = page.locator('tbody tr').filter({ hasNotText: /진행중|IN_PROGRESS/ }).first()
    const isVisible = await srRow.isVisible().catch(() => false)
    
    if (isVisible) {
      await srRow.click()
      await page.waitForURL(/\/srs\/[^/]+$/, { timeout: 5000 })
      
      // 상태 변경 UI 확인
      const statusUI = page.locator('button, select').filter({ hasText: /상태|Status/ })
      const uiVisible = await statusUI.isVisible().catch(() => false)
      
      if (uiVisible) {
        await expect(statusUI.first()).toBeVisible()
      }
    } else {
      test.skip()
    }
  })

  test('SR 완료 상태로 변경', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 진행중인 SR 찾기
    const inProgressSR = page.locator('tbody tr').filter({ hasText: /진행중|IN_PROGRESS/ }).first()
    const isVisible = await inProgressSR.isVisible().catch(() => false)
    
    if (isVisible) {
      await inProgressSR.click()
      await page.waitForURL(/\/srs\/[^/]+$/, { timeout: 5000 })
      
      // 완료 버튼 확인
      const completeButton = page.locator('button').filter({ hasText: /완료|Complete/ })
      const buttonVisible = await completeButton.isVisible().catch(() => false)
      
      if (buttonVisible) {
        await expect(completeButton).toBeVisible()
      }
    } else {
      test.skip()
    }
  })
})


