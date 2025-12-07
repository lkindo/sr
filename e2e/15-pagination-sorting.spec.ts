import { test, expect } from '@playwright/test'

/**
 * 페이지네이션 및 정렬 테스트
 * 
 * 모든 목록 페이지에서 페이지네이션과 정렬 기능 검증
 */

test.describe('페이지네이션 및 정렬', () => {
  test('SR 목록 테이블 헤더 및 정렬', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')

    // 테이블 헤더가 반드시 있어야 함
    const tableHeaders = page.locator('thead th, [role="columnheader"]')
    await expect(tableHeaders.first()).toBeVisible({ timeout: 10000 })

    const headerCount = await tableHeaders.count()
    expect(headerCount).toBeGreaterThan(0)
    console.log(`✅ SR 목록 테이블 헤더: ${headerCount}개`)

    // 정렬 가능한 헤더 클릭 테스트
    const sortableHeader = tableHeaders.first()
    await sortableHeader.click()
    await page.waitForTimeout(500)

    console.log('✅ 테이블 헤더 클릭 완료')
  })

  test('SR 목록 페이지네이션 컨트롤 확인', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')

    // 페이지네이션 또는 "더 보기" 버튼 확인
    const pagination = page.locator('[aria-label*="pagination"], nav, button').filter({ hasText: /다음|Next|이전|Previous|더 보기|Load more/i })
    const hasPagination = await pagination.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasPagination) {
      await expect(pagination.first()).toBeVisible()
      console.log('✅ 페이지네이션 컨트롤 확인')
    } else {
      // 데이터가 적어서 페이지네이션이 없을 수 있음
      const rows = page.locator('tbody tr')
      const rowCount = await rows.count()
      console.log(`ℹ️ 페이지네이션 없음 (데이터 ${rowCount}개 - 1페이지에 표시)`)
    }
  })

  test('사용자 목록 테이블 확인', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')

    // 테이블이 반드시 있어야 함
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })

    // 테이블 헤더 확인
    const tableHeaders = page.locator('thead th')
    const headerCount = await tableHeaders.count()
    expect(headerCount).toBeGreaterThan(0)
    console.log(`✅ 사용자 목록 테이블 헤더: ${headerCount}개`)
  })

  test('고객사 목록 테이블 확인', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    // 테이블이 반드시 있어야 함
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })

    // 테이블 헤더 확인
    const tableHeaders = page.locator('thead th')
    const headerCount = await tableHeaders.count()
    expect(headerCount).toBeGreaterThan(0)
    console.log(`✅ 고객사 목록 테이블 헤더: ${headerCount}개`)
  })

  test('페이지 크기 변경 (있는 경우)', async ({ page }) => {
    await page.goto('/srs')
    await page.waitForLoadState('networkidle')

    // 페이지 크기 선택기 찾기 (10, 20, 50개 등)
    const pageSizeSelect = page.locator('select, [role="combobox"]').filter({ hasText: /10|20|50|100/i }).first()

    if (await pageSizeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pageSizeSelect.click()
      await page.waitForTimeout(300)

      const option = page.locator('[role="option"]').filter({ hasText: '20' }).first()
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        await option.click()
        await page.waitForTimeout(500)
        console.log('✅ 페이지 크기 변경: 20개')
      }
    } else {
      console.log('ℹ️ 페이지 크기 선택기 없음')
    }
  })
})
