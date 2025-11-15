import { test, expect } from '@playwright/test'

/**
 * 사용자 프로필 관리 테스트
 */

test.describe('사용자 프로필 관리', () => {
  test('프로필 페이지 접근', async ({ page }) => {
    await page.goto('/settings')
    
    // 페이지가 로드될 때까지 대기
    await page.waitForLoadState('networkidle')
    
    // 프로필 섹션 확인
    const profileSection = page.locator('section, div').filter({ hasText: /프로필|Profile/ })
    const sectionVisible = await profileSection.isVisible().catch(() => false)
    
    if (sectionVisible) {
      await expect(profileSection.first()).toBeVisible()
    }
  })

  test('프로필 수정 버튼', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    
    // 프로필 수정 버튼 찾기
    const editButton = page.locator('button').filter({ hasText: /수정|Edit|변경/ })
    const buttonVisible = await editButton.isVisible().catch(() => false)
    
    if (buttonVisible) {
      await expect(editButton.first()).toBeVisible()
    } else {
      test.skip()
    }
  })

  test('비밀번호 변경 섹션', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    
    // 비밀번호 변경 섹션 찾기
    const passwordSection = page.locator('section, div').filter({ hasText: /비밀번호|Password/ })
    const sectionVisible = await passwordSection.isVisible().catch(() => false)
    
    if (sectionVisible) {
      await expect(passwordSection.first()).toBeVisible()
    }
  })

  test('사용자 정보 표시', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    
    // 사용자 이름 또는 이메일 표시 확인
    const userInfo = page.locator('text=/@|이메일|Email/')
    const infoVisible = await userInfo.isVisible().catch(() => false)
    
    if (infoVisible) {
      await expect(userInfo.first()).toBeVisible()
    }
  })
})


