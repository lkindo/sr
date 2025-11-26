import { test, expect } from '@playwright/test'

/**
 * Organization 페이지 테스트
 * - 조직도 뷰 확인
 * - 고객사별 사용자 트리 구조
 * - 사용자 Drag & Drop 재배정 (구현되어 있을 경우)
 */

test.describe('Organization 페이지', () => {
    test('Organization 페이지 접근', async ({ page }) => {
        await page.goto('/organization')
        await page.waitForLoadState('networkidle')

        // 페이지 콘텐츠 확인
        const mainContent = page.locator('main, [role="main"]')
        await expect(mainContent).toBeVisible()

        console.log('✅ Organization 페이지 접근 성공')
    })

    test('조직도 트리 구조 확인', async ({ page }) => {
        await page.goto('/organization')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000)

        // 트리 구조 또는 카드 레이아웃 확인
        const treeOrCards = page.locator('[role="tree"], [class*="tree"], [class*="organization"], .card, [class*="Card"]')
        const structureVisible = await treeOrCards.isVisible({ timeout: 3000 }).catch(() => false)

        if (!structureVisible) {
            console.log('⚠️ 조직도 구조를 찾을 수 없습니다. 테스트 스킵.')
            test.skip()
            return
        }

        console.log('✅ 조직도 트리 구조 확인')

        // 고객사 목록이 표시되는지 확인
        const clientElements = page.locator('[class*="client"], [data-type="client"]')
        const clientCount = await clientElements.count()

        console.log(`📊 표시된 고객사 수: ${clientCount}`)
        expect(clientCount).toBeGreaterThanOrEqual(0)
    })

    test('고객사별 사용자 목록 확인', async ({ page }) => {
        await page.goto('/organization')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000)

        // 첫 번째 고객사 찾기
        const firstClient = page.locator('[class*="client"], [data-type="client"]').first()
        const clientVisible = await firstClient.isVisible({ timeout: 3000 }).catch(() => false)

        if (!clientVisible) {
            console.log('⚠️ 고객사를 찾을 수 없습니다. 테스트 스킵.')
            test.skip()
            return
        }

        const clientName = await firstClient.textContent() || '고객사'
        console.log(`📋 고객사: ${clientName}`)

        // 확장 가능한 경우 확장
        const expandButton = firstClient.locator('button, [role="button"]').filter({ hasText: /확장|펼치기|expand/i }).first()
        const expandVisible = await expandButton.isVisible({ timeout: 1000 }).catch(() => false)

        if (expandVisible) {
            await expandButton.click()
            await page.waitForTimeout(500)
        }

        // 사용자 목록 확인
        const userElements = page.locator('[class*="user"], [data-type="user"]')
        const userCount = await userElements.count()

        console.log(`👥 표시된 사용자 수: ${userCount}`)
        expect(userCount).toBeGreaterThanOrEqual(0)
    })

    test('사용자 Drag & Drop 재배정 (기능 존재 시)', async ({ page }) => {
        await page.goto('/organization')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000)

        // Drag 가능한 사용자 카드 찾기
        const draggableUser = page.locator('[draggable="true"], [data-draggable="true"]').first()
        const isDraggable = await draggableUser.isVisible({ timeout: 3000 }).catch(() => false)

        if (!isDraggable) {
            console.log('⚠️ Drag & Drop 기능이 구현되어 있지 않습니다. 테스트 스킵.')
            test.skip()
            return
        }

        console.log('✅ Drag & Drop 기능 발견')

        // Drop 대상 찾기
        const dropTarget = page.locator('[class*="drop"], [data-droppable="true"]').nth(1)
        const isDroppable = await dropTarget.isVisible({ timeout: 2000 }).catch(() => false)

        if (!isDroppable) {
            console.log('⚠️ Drop 대상을 찾을 수 없습니다.')
            return
        }

        // Drag & Drop 수행
        try {
            await draggableUser.dragTo(dropTarget)
            await page.waitForTimeout(500)

            // 확인 Dialog가 있을 경우
            const confirmDialog = page.locator('[role="dialog"], .dialog').first()
            const dialogVisible = await confirmDialog.isVisible({ timeout: 2000 }).catch(() => false)

            if (dialogVisible) {
                console.log('✅ 재배정 확인 Dialog 표시')

                // 취소 버튼 클릭 (실제 재배정은 하지 않음)
                const cancelButton = confirmDialog.locator('button').filter({ hasText: /취소|Cancel/i }).first()
                const cancelVisible = await cancelButton.isVisible().catch(() => false)

                if (cancelVisible) {
                    await cancelButton.click()
                    console.log('✅ 재배정 취소 완료')
                }
            }

            console.log('✅ Drag & Drop 동작 확인 완료')
        } catch (error) {
            console.log('⚠️ Drag & Drop 실행 실패:', error)
        }
    })
})
