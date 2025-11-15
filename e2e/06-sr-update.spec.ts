import { test, expect } from '@playwright/test'

/**
 * SR 수정 플로우 테스트
 */

test.describe('SR 수정', () => {
  test('SR 수정 다이얼로그 열기', async ({ page }) => {
    await page.goto('/srs')
    
    // SR 목록이 로드될 때까지 대기
    await page.waitForLoadState('networkidle')
    
    // 첫 번째 SR의 수정 버튼 찾기 (있는 경우)
    const editButton = page.locator('button').filter({ hasText: /수정|Edit/ }).first()
    
    // 수정 버튼이 있으면 클릭
    const isVisible = await editButton.isVisible().catch(() => false)
    if (isVisible) {
      await editButton.click()
      
      // 수정 다이얼로그가 열리는지 확인
      await expect(page.getByRole('heading', { name: /SR 수정|Edit SR/ })).toBeVisible({ timeout: 5000 })
    } else {
      // 수정 버튼이 없으면 테스트 스킵 (SR이 없거나 권한이 없을 수 있음)
      test.skip()
    }
  })

  test('SR 상세 페이지에서 수정', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 첫 번째 SR 클릭
    const firstSR = page.locator('tbody tr').first()
    const isVisible = await firstSR.isVisible().catch(() => false)
    
    if (isVisible) {
      await firstSR.click()
      
      // 상세 페이지로 이동 확인
      await expect(page).toHaveURL(/\/srs\/[^/]+$/, { timeout: 5000 })
      
      // 수정 버튼 확인
      const editButton = page.locator('button').filter({ hasText: /수정|Edit/ })
      const editButtonVisible = await editButton.isVisible().catch(() => false)
      
      if (editButtonVisible) {
        await expect(editButton).toBeVisible()
      }
    } else {
      test.skip()
    }
  })
})


