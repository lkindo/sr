import { test, expect } from '@playwright/test'

/**
 * SR 상세 페이지 테스트
 */

test.describe('SR 상세 페이지', () => {
  // NOTE: Global setup을 통해 로그인 상태가 자동으로 로드됩니다.

  test('SR 상세 페이지 접근', async ({ page }) => {
    await page.goto('/srs')

    // 첫 번째 SR 링크 찾기
    const firstSRLink = page.locator('table tbody tr a').first()
    if (await firstSRLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      // 직접 이동 (클릭 사용 - SPA 라우팅)
      await firstSRLink.click()

      // 상세 정보 섹션 헤딩과 댓글 탭 확인
      await expect(page.locator('h3:has-text("상세 정보")')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('button[role="tab"]:has-text("댓글")')).toBeVisible()
    } else {
      console.log('⚠️ SR이 없습니다. 테스트 스킵.');
      test.skip();
    }
  })

  test('SR 탭 네비게이션', async ({ page }) => {
    await page.goto('/srs')

    // 첫 번째 SR 링크 찾기
    const firstSRLink = page.locator('table tbody tr a').first()
    if (await firstSRLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      // 직접 이동 (클릭 사용)
      await firstSRLink.click()

      // 탭 확인 (실제 UI: 댓글 (0), 첨부파일 (0), 활동 이력)
      await expect(page.locator('button[role="tab"]:has-text("댓글")')).toBeVisible({ timeout: 10000 })
      await expect(page.locator('button[role="tab"]:has-text("첨부파일")')).toBeVisible()
      await expect(page.locator('button[role="tab"]:has-text("활동 이력")')).toBeVisible()

      // 각 탭 클릭
      await page.click('button[role="tab"]:has-text("첨부파일")')
      await page.waitForTimeout(500)

      await page.click('button[role="tab"]:has-text("활동 이력")')
      await page.waitForTimeout(500)
    } else {
      test.skip();
    }
  })

  test('SR 코멘트 추가', async ({ page }) => {
    await page.goto('/srs')

    // 첫 번째 SR 링크 찾기
    const firstSRLink = page.locator('table tbody tr a').first()
    if (await firstSRLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      // 직접 이동 (클릭 사용)
      await firstSRLink.click()

      // 댓글 탭 클릭 (기본적으로 열려 있지만 명시적으로 클릭)
      await page.click('button[role="tab"]:has-text("댓글")')
      await page.waitForTimeout(500)

      // 댓글 입력 (textarea는 placeholder로 식별)
      await page.fill('textarea[placeholder="댓글을 입력하세요..."]', '이것은 E2E 테스트 댓글입니다.')

      // 제출 및 응답 대기
      const commentResponsePromise = page.waitForResponse(resp => resp.url().includes('/api/comments') && resp.request().method() === 'POST', { timeout: 10000 }).catch(() => null);
      await page.click('button[type="submit"]:has-text("댓글 추가")')

      const commentResponse = await commentResponsePromise;
      if (commentResponse) {
        console.log(`✅ 댓글 추가 API 응답: ${commentResponse.status()}`);
      }

      // 성공 확인
      await expect(page.locator('text=이것은 E2E 테스트 댓글입니다.')).toBeVisible({ timeout: 10000 })
    } else {
      test.skip();
    }
  })
})
