import { test, expect } from '@playwright/test'

/**
 * SR 상세 페이지 테스트
 */

test.describe('SR 상세 페이지', () => {
  // NOTE: Global setup을 통해 로그인 상태가 자동으로 로드됩니다.
  
  test('SR 상세 페이지 접근', async ({ page }) => {
    await page.goto('/srs')

    // SR 목록이 로드될 때까지 대기
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000) // 테이블 렌더링 대기

    // 첫 번째 SR 클릭
    const firstSR = page.locator('table tbody tr').first()
    if (await firstSR.isVisible()) {
      // 클릭 후 네비게이션 대기
      await Promise.all([
        page.waitForURL(/\/srs\/[^/]+/, { timeout: 10000 }),
        firstSR.click()
      ])

      // SR 상세 페이지 로드 확인
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(2000) // 상세 페이지 렌더링 대기

      // 상세 정보 섹션 헤딩과 댓글 탭 확인
      await expect(page.locator('h3:has-text("상세 정보")')).toBeVisible()
      await expect(page.locator('button:has-text("댓글")')).toBeVisible()
    }
  })

  test('SR 탭 네비게이션', async ({ page }) => {
    await page.goto('/srs')

    // SR 목록이 로드될 때까지 대기
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // 첫 번째 SR로 이동
    const firstSR = page.locator('table tbody tr').first()
    if (await firstSR.isVisible()) {
      // 클릭 후 네비게이션 대기
      await Promise.all([
        page.waitForURL(/\/srs\/[^/]+/, { timeout: 10000 }),
        firstSR.click()
      ])

      // SR 상세 페이지 로드 확인
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(2000)

      // 탭 확인 (실제 UI: 댓글 (0), 첨부파일 (0), 활동 이력)
      await expect(page.locator('button[role="tab"]:has-text("댓글")')).toBeVisible()
      await expect(page.locator('button[role="tab"]:has-text("첨부파일")')).toBeVisible()
      await expect(page.locator('button[role="tab"]:has-text("활동 이력")')).toBeVisible()

      // 각 탭 클릭
      await page.click('button[role="tab"]:has-text("첨부파일")')
      await page.waitForTimeout(500)

      await page.click('button[role="tab"]:has-text("활동 이력")')
      await page.waitForTimeout(500)
    }
  })

  test('SR 코멘트 추가', async ({ page }) => {
    await page.goto('/srs')

    // SR 목록이 로드될 때까지 대기
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)

    // 첫 번째 SR로 이동
    const firstSR = page.locator('table tbody tr').first()
    if (await firstSR.isVisible()) {
      // 클릭 후 네비게이션 대기
      await Promise.all([
        page.waitForURL(/\/srs\/[^/]+/, { timeout: 10000 }),
        firstSR.click()
      ])

      // SR 상세 페이지 로드 확인
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(2000)

      // 댓글 탭 클릭 (기본적으로 열려 있지만 명시적으로 클릭)
      await page.click('button[role="tab"]:has-text("댓글")')
      await page.waitForTimeout(500)

      // 댓글 입력 (textarea는 placeholder로 식별)
      await page.fill('textarea[placeholder="댓글을 입력하세요..."]', '이것은 E2E 테스트 댓글입니다.')

      // 제출
      await page.click('button[type="submit"]:has-text("댓글 추가")')

      // 성공 확인
      await page.waitForTimeout(1000)
      await expect(page.locator('text=이것은 E2E 테스트 댓글입니다.')).toBeVisible()
    }
  })
})

