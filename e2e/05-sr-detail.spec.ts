import { test, expect } from '@playwright/test'

/**
 * SR 상세 페이지 테스트
 */

test.describe('SR 상세 페이지', () => {
  // NOTE: Global setup을 통해 로그인 상태가 자동으로 로드됩니다.
  
  test('SR 상세 페이지 접근', async ({ page }) => {
    await page.goto('/srs')
    
    // 첫 번째 SR 클릭
    const firstSR = page.locator('table tbody tr').first()
    if (await firstSR.isVisible()) {
      await firstSR.click()
      
      // SR 상세 페이지 로드 확인
      await expect(page.locator('text=SR 번호')).toBeVisible()
      await expect(page.locator('text=제목')).toBeVisible()
      await expect(page.locator('text=설명')).toBeVisible()
    }
  })

  test('SR 탭 네비게이션', async ({ page }) => {
    await page.goto('/srs')
    
    // 첫 번째 SR로 이동
    const firstSR = page.locator('table tbody tr').first()
    if (await firstSR.isVisible()) {
      await firstSR.click()
      
      // 탭 확인
      await expect(page.locator('button:has-text("상세")')).toBeVisible()
      await expect(page.locator('button:has-text("활동")')).toBeVisible()
      await expect(page.locator('button:has-text("코멘트")')).toBeVisible()
      await expect(page.locator('button:has-text("첨부파일")')).toBeVisible()
      
      // 각 탭 클릭
      await page.click('button:has-text("활동")')
      await page.waitForTimeout(500)
      
      await page.click('button:has-text("코멘트")')
      await page.waitForTimeout(500)
      
      await page.click('button:has-text("첨부파일")')
      await page.waitForTimeout(500)
    }
  })

  test('SR 코멘트 추가', async ({ page }) => {
    await page.goto('/srs')
    
    // 첫 번째 SR로 이동
    const firstSR = page.locator('table tbody tr').first()
    if (await firstSR.isVisible()) {
      await firstSR.click()
      
      // 코멘트 탭 클릭
      await page.click('button:has-text("코멘트")')
      
      // 코멘트 입력
      await page.fill('textarea[name="content"]', '이것은 E2E 테스트 코멘트입니다.')
      
      // 제출
      await page.click('button:has-text("코멘트 작성")')
      
      // 성공 확인
      await expect(page.locator('text=이것은 E2E 테스트 코멘트입니다.')).toBeVisible()
    }
  })
})

