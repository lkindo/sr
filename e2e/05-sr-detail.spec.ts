import { test, expect } from '@playwright/test'

/**
 * SR 상세 페이지 테스트
 */

test.describe('SR 상세 페이지', () => {
  // NOTE: Global setup을 통해 로그인 상태가 자동으로 로드됩니다.

  test('SR 상세 페이지 접근', async ({ page }) => {
    await page.goto('/srs')

    // SR 목록이 로드될 때까지 대기
    await page.waitForLoadState('networkidle')

    // 첫 번째 SR 링크 찾기
    const firstSRLink = page.locator('table tbody tr a').first()
    if (await firstSRLink.isVisible()) {
      const href = await firstSRLink.getAttribute('href')
      if (href) {
        // 직접 이동
        await page.goto(href)

        // SR 상세 페이지 로드 확인
        await page.waitForLoadState('networkidle')

        // 상세 정보 섹션 헤딩과 댓글 탭 확인
        await expect(page.locator('h3:has-text("상세 정보")')).toBeVisible()
        await expect(page.locator('button[role="tab"]:has-text("댓글")')).toBeVisible()
      }
    }
  })

  test('SR 탭 네비게이션', async ({ page }) => {
    await page.goto('/srs')

    // SR 목록이 로드될 때까지 대기
    await page.waitForLoadState('networkidle')

    // 첫 번째 SR 링크 찾기
    const firstSRLink = page.locator('table tbody tr a').first()
    if (await firstSRLink.isVisible()) {
      const href = await firstSRLink.getAttribute('href')
      if (href) {
        // 직접 이동
        await page.goto(href)

        // SR 상세 페이지 로드 확인
        await page.waitForLoadState('networkidle')

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
    }
  })

  test('SR 코멘트 추가', async ({ page }) => {
    await page.goto('/srs')

    // SR 목록이 로드될 때까지 대기
    await page.waitForLoadState('networkidle')

    // 첫 번째 SR 링크 찾기
    const firstSRLink = page.locator('table tbody tr a').first()
    if (await firstSRLink.isVisible()) {
      const href = await firstSRLink.getAttribute('href')
      if (href) {
        // 직접 이동
        await page.goto(href)

        // SR 상세 페이지 로드 확인
        await page.waitForLoadState('networkidle')

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
    }
  })
})
