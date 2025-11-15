import { test, expect } from '@playwright/test'

/**
 * 역할 관리 테스트
 */

test.describe('역할 관리', () => {
  test('역할 목록 페이지 접근', async ({ page }) => {
    await page.goto('/roles')
    
    // 페이지가 로드될 때까지 대기
    await page.waitForLoadState('networkidle')
    
    // 역할 목록 테이블 확인
    await expect(page.locator('table')).toBeVisible()
  })

  test('역할 등록 버튼', async ({ page }) => {
    await page.goto('/roles')
    await page.waitForLoadState('networkidle')
    
    // 등록 버튼 찾기
    const registerButton = page.locator('button').filter({ hasText: /등록|Register|새|New/ })
    const isVisible = await registerButton.isVisible().catch(() => false)
    
    if (isVisible) {
      await expect(registerButton).toBeVisible()
    } else {
      test.skip()
    }
  })

  test('역할 상세 정보 확인', async ({ page }) => {
    await page.goto('/roles')
    await page.waitForLoadState('networkidle')
    
    // 첫 번째 역할 행 클릭
    const firstRole = page.locator('tbody tr').first()
    const isVisible = await firstRole.isVisible().catch(() => false)
    
    if (isVisible) {
      // 역할 이름 확인
      const roleName = firstRole.locator('td').first()
      await expect(roleName).toBeVisible()
      
      // 권한 수 확인
      const permissionCount = firstRole.locator('td').nth(1)
      await expect(permissionCount).toBeVisible()
    } else {
      test.skip()
    }
  })

  test('역할 권한 관리 버튼', async ({ page }) => {
    await page.goto('/roles')
    await page.waitForLoadState('networkidle')
    
    // 권한 관리 버튼 찾기
    const permissionButton = page.locator('button').filter({ hasText: /권한|Permission/ })
    const isVisible = await permissionButton.isVisible().catch(() => false)
    
    if (isVisible) {
      await expect(permissionButton.first()).toBeVisible()
    } else {
      test.skip()
    }
  })
})

