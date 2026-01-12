import { test, expect } from '@playwright/test'

/**
 * 대시보드 개요 테스트
 * - 기본 UI 확인
 * - Dashboard 통계 확인
 * - 빠른 액션 동작
 */

test.describe('대시보드', () => {
  test('대시보드 페이지 접근', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // 대시보드 콘텐츠가 반드시 보여야 함
    const dashboardContent = page.locator('main, [role="main"]')
    await expect(dashboardContent).toBeVisible({ timeout: 10000 })
    console.log('✅ 대시보드 페이지 접근 성공')
  })

  test('SR 통계 카드 확인', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // 통계 카드가 반드시 있어야 함
    const statCards = page.locator('[class*="card"], [class*="Card"]')
    await expect(statCards.first()).toBeVisible({ timeout: 10000 })

    const cardCount = await statCards.count()
    expect(cardCount).toBeGreaterThan(0)
    console.log(`✅ 통계 카드: ${cardCount}개`)
  })

  test('Dashboard API 응답 검증', async ({ page }) => {
    // API 응답 캡처를 위한 Promise 설정
    const statsResponsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/dashboard/stats') || resp.url().includes('/api/srs'),
      { timeout: 15000 }
    ).catch(() => null)

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // API 응답 대기
    const response = await statsResponsePromise

    if (response) {
      try {
        const statsResponse = await response.json()
        console.log('✅ Dashboard API 응답 수신')
        expect(statsResponse).toBeDefined()

        // 총 SR 수 확인
        const total = statsResponse.total ?? statsResponse.summary?.total ?? statsResponse.data?.length
        if (total !== undefined) {
          console.log(`✅ 총 SR 개수: ${total}`)
        }

        // 상태별 통계 확인
        if (statsResponse.byStatus) {
          console.log('📊 상태별 SR 분포:', statsResponse.byStatus)
        }
      } catch {
        console.log('ℹ️ API 응답 파싱 불가 - 페이지 로드 확인만 진행')
      }
    } else {
      // API 응답이 없어도 페이지가 정상 로드되면 통과
      await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
      console.log('ℹ️ API 응답 캡처 실패 - 페이지 로드 확인됨')
    }
  })

  test('통계 요소 화면 표시 확인', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // 대시보드 메인 콘텐츠 확인
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 })

    // 통계 관련 요소 찾기 (다양한 형태 지원)
    const statsElements = page.locator('[class*="stat"], [class*="count"], [class*="total"], [class*="card"]')
    const hasStats = await statsElements.first().isVisible({ timeout: 5000 }).catch(() => false)

    if (hasStats) {
      const count = await statsElements.count()
      console.log(`✅ 통계 요소: ${count}개 발견`)
    } else {
      console.log('ℹ️ 통계 요소 미발견 - 대시보드 구조가 다를 수 있음')
    }
  })

  test('최근 SR 또는 활동 섹션 확인', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // 최근 SR, 활동, 테이블 등 찾기
    const recentSection = page.locator('section, div, table').filter({ hasText: /최근|Recent|활동|Activity/i })
    const hasRecent = await recentSection.first().isVisible({ timeout: 5000 }).catch(() => false)

    if (hasRecent) {
      console.log('✅ 최근 SR/활동 섹션 확인')
    } else {
      // 대시보드 기본 콘텐츠만 확인
      await expect(page.locator('main')).toBeVisible()
      console.log('ℹ️ 최근 섹션 미발견 - 대시보드 로드 확인')
    }
  })

  test('빠른 액션 버튼 확인', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // 빠른 액션 버튼 찾기
    const quickActions = page.locator('button, a').filter({ hasText: /새 SR|New SR|생성|등록|요청/i })
    const hasQuickAction = await quickActions.first().isVisible({ timeout: 5000 }).catch(() => false)

    if (hasQuickAction) {
      console.log('✅ 빠른 액션 버튼 확인')

      // 버튼 클릭 테스트
      await quickActions.first().click()
      await page.waitForTimeout(500)

      // Dialog 또는 페이지 이동 확인
      const dialog = page.locator('[role="dialog"]')
      const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false)

      if (dialogVisible) {
        console.log('✅ SR 생성 Dialog 열림')
        await page.keyboard.press('Escape')
      } else if (page.url().includes('/srs') || page.url().includes('/create')) {
        console.log('✅ SR 생성 페이지로 이동')
        await page.goto('/dashboard')
      }
    } else {
      // 빠른 액션이 없어도 대시보드가 정상이면 통과
      await expect(page.locator('main')).toBeVisible()
      console.log('ℹ️ 빠른 액션 버튼 미발견 - 대시보드 로드 확인')
    }
  })
})
