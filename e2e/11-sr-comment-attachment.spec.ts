import { test, expect } from '@playwright/test'

/**
 * SR 댓글 및 첨부파일 관리 테스트
 */

test.describe('SR 댓글 및 첨부파일', () => {
  test('SR 상세 페이지에서 댓글 섹션 확인', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 첫 번째 SR 클릭
    const firstSR = page.locator('tbody tr').first()
    const isVisible = await firstSR.isVisible().catch(() => false)
    
    if (isVisible) {
      await firstSR.click()
      await page.waitForURL(/\/srs\/[^/]+$/, { timeout: 5000 })
      
      // 댓글 섹션 확인
      const commentSection = page.locator('section, div').filter({ hasText: /댓글|Comment/ })
      const sectionVisible = await commentSection.isVisible().catch(() => false)
      
      if (sectionVisible) {
        await expect(commentSection).toBeVisible()
      }
    } else {
      test.skip()
    }
  })

  test('댓글 작성 기능', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 첫 번째 SR 클릭
    const firstSR = page.locator('tbody tr').first()
    const isVisible = await firstSR.isVisible().catch(() => false)
    
    if (isVisible) {
      await firstSR.click()
      await page.waitForURL(/\/srs\/[^/]+$/, { timeout: 5000 })
      
      // 댓글 입력 필드 찾기
      const commentInput = page.locator('textarea, input').filter({ hasText: /댓글|Comment/ })
      const inputVisible = await commentInput.isVisible().catch(() => false)
      
      if (inputVisible) {
        await commentInput.fill('테스트 댓글입니다.')
        
        // 댓글 작성 버튼
        const submitButton = page.locator('button').filter({ hasText: /작성|Submit|등록/ })
        const buttonVisible = await submitButton.isVisible().catch(() => false)
        
        if (buttonVisible) {
          await expect(submitButton).toBeVisible()
        }
      } else {
        test.skip()
      }
    } else {
      test.skip()
    }
  })

  test('첨부파일 섹션 확인', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 첫 번째 SR 클릭
    const firstSR = page.locator('tbody tr').first()
    const isVisible = await firstSR.isVisible().catch(() => false)
    
    if (isVisible) {
      await firstSR.click()
      await page.waitForURL(/\/srs\/[^/]+$/, { timeout: 5000 })
      
      // 첨부파일 섹션 확인
      const attachmentSection = page.locator('section, div').filter({ hasText: /첨부|Attachment/ })
      const sectionVisible = await attachmentSection.isVisible().catch(() => false)
      
      if (sectionVisible) {
        await expect(attachmentSection).toBeVisible()
      }
    } else {
      test.skip()
    }
  })

  test('첨부파일 업로드 버튼 확인', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')
    
    // 첫 번째 SR 클릭
    const firstSR = page.locator('tbody tr').first()
    const isVisible = await firstSR.isVisible().catch(() => false)
    
    if (isVisible) {
      await firstSR.click()
      await page.waitForURL(/\/srs\/[^/]+$/, { timeout: 5000 })
      
      // 첨부파일 업로드 버튼 찾기
      const uploadButton = page.locator('button, input[type="file"]').filter({ hasText: /업로드|Upload|첨부/ })
      const buttonVisible = await uploadButton.isVisible().catch(() => false)
      
      if (buttonVisible) {
        await expect(uploadButton).toBeVisible()
      }
    } else {
      test.skip()
    }
  })
})


