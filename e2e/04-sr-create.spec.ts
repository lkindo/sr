import { test, expect } from '@playwright/test'

/**
 * SR 생성 플로우 테스트
 */

test.describe('SR 생성', () => {
  // NOTE: Global setup을 통해 로그인 상태가 자동으로 로드됩니다.

  test('SR 생성 다이얼로그 열기', async ({ page }) => {
    await page.goto('/srs')

    // 등록 버튼 클릭
    await page.click('button:has-text("등록")')

    // 다이얼로그 제목 확인
    await expect(page.getByRole('heading', { name: /새 SR 요청/ })).toBeVisible()
  })

  test('SR 생성 플로우 - 전체', async ({ page }) => {
    await page.goto('/srs')

    // 등록 버튼 클릭 (실제 UI에서는 "등록" 텍스트 사용)
    await page.click('button:has-text("등록")')

    // 다이얼로그가 열릴 때까지 대기
    await expect(page.getByRole('heading', { name: /새 SR 요청/ })).toBeVisible()

    // 유니크한 제목 생성
    const timestamp = Date.now()
    const srTitle = `E2E 테스트 SR ${timestamp}`

    // 폼 입력
    await page.fill('#title', srTitle)
    await page.fill('#description', '이것은 Playwright를 사용한 E2E 테스트 SR입니다.')

    // 고객사 선택 (shadcn/ui Select 컴포넌트)
    // 트리거 버튼 클릭
    await page.locator('#client').click()
    // 옵션이 나타날 때까지 대기
    await expect(page.locator('[role="option"]').first()).toBeVisible()
    // 첫 번째 고객사 선택
    await page.locator('[role="option"]').first().click()

    // 서비스 카테고리 선택 (필수)
    await page.locator('#category').click()
    await expect(page.locator('[role="option"]').first()).toBeVisible()
    await page.locator('[role="option"]').first().click()

    // 우선순위는 이미 MEDIUM이 기본값이므로 변경하지 않음

    // 제출
    const submitButton = page.locator('button[type="submit"]').filter({ hasText: '저장' })
    await submitButton.click()

    // 다이얼로그가 닫힐 때까지 대기 (성공 시 닫힘)
    await expect(page.getByRole('heading', { name: /새 SR 요청/ })).not.toBeVisible({ timeout: 10000 })

    // SR 목록으로 이동하여 생성된 SR 확인 (이미 목록 페이지에 있지만 리프레시 확인)
    // 목록이 갱신되었는지 확인하기 위해 잠시 대기하거나 리로드
    await page.reload()
    await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 15000 })
  })

  test('SR 생성 유효성 검증', async ({ page }) => {
    await page.goto('/srs')

    // 등록 버튼 클릭 (실제 UI에서는 "등록" 텍스트 사용)
    await page.click('button:has-text("등록")')

    // 빈 폼으로 제출 시도
    await page.click('button[type="submit"]:has-text("저장")')

    // 유효성 검증 메시지 확인
    await expect(page.locator('text=필수')).toBeVisible()
  })
})
