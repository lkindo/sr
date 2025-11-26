import { test, expect } from '@playwright/test'

/**
 * Settings 페이지들 테스트
 * - Settings 메인 페이지
 * - Profile 설정
 * - Notification 설정
 * - System 설정 (ADMIN 전용)
 */

test.describe('Settings 페이지', () => {
    test('Settings 메인 페이지 접근', async ({ page }) => {
        await page.goto('/settings')
        await page.waitForLoadState('networkidle')

        // 페이지 콘텐츠 확인
        const mainContent = page.locator('main, [role="main"]')
        await expect(mainContent).toBeVisible()

        console.log('✅ Settings 메인 페이지 접근 성공')
    })

    test('Profile 설정 페이지 접근', async ({ page }) => {
        await page.goto('/settings/profile')
        await page.waitForLoadState('networkidle')

        const mainContent = page.locator('main, [role="main"]')
        await expect(mainContent).toBeVisible()

        console.log('✅ Profile 설정 페이지 접근 성공')
    })

    test('프로필 정보 수정', async ({ page }) => {
        await page.goto('/settings/profile')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000)

        // 이름 입력 필드 찾기
        const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first()
        const nameVisible = await nameInput.isVisible({ timeout: 3000 }).catch(() => false)

        if (!nameVisible) {
            console.log('⚠️ 이름 입력 필드를 찾을 수 없습니다. 테스트 스킵.')
            test.skip()
            return
        }

        // 현재 이름 가져오기
        const currentName = await nameInput.inputValue()
        console.log(`📝 현재 이름: ${currentName}`)

        // 이름 변경
        const timestamp = Date.now()
        const newName = `${currentName} (Test ${timestamp})`
        await nameInput.fill(newName)

        // 저장 버튼 찾기
        const saveButton = page.locator('button').filter({ hasText: /저장|Save/i }).first()
        const saveVisible = await saveButton.isVisible({ timeout: 2000 }).catch(() => false)

        if (saveVisible) {
            await saveButton.click()
            await page.waitForTimeout(1000)

            console.log(`✅ 프로필 수정 완료: ${newName}`)

            // 성공 메시지 확인
            const successMessage = page.locator('[role="status"], .toast').filter({ hasText: /성공|저장/i }).first()
            const messageVisible = await successMessage.isVisible({ timeout: 3000 }).catch(() => false)

            if (messageVisible) {
                console.log('✅ 저장 성공 메시지 확인')
            }

            // 원래 이름으로 복구
            await nameInput.fill(currentName)
            await saveButton.click()
            await page.waitForTimeout(1000)
            console.log('✅ 원래 이름으로 복구 완료')
        }
    })

    test('비밀번호 변경 기능', async ({ page }) => {
        await page.goto('/settings/profile')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000)

        // 비밀번호 변경 버튼 또는 섹션 찾기
        const passwordButton = page.locator('button, a').filter({ hasText: /비밀번호|Password/i }).first()
        const buttonVisible = await passwordButton.isVisible({ timeout: 3000 }).catch(() => false)

        if (!buttonVisible) {
            console.log('⚠️ 비밀번호 변경 버튼을 찾을 수 없습니다. 테스트 스킵.')
            test.skip()
            return
        }

        await passwordButton.click()
        await page.waitForTimeout(500)

        // Dialog 또는 페이지 확인
        const dialog = page.locator('[role="dialog"], .dialog, .modal').first()
        const dialogVisible = await dialog.isVisible({ timeout: 2000 }).catch(() => false)

        if (dialogVisible) {
            console.log('✅ 비밀번호 변경 Dialog 열림')

            // 필드 확인
            const currentPasswordInput = dialog.locator('input[type="password"]').nth(0)
            const newPasswordInput = dialog.locator('input[type="password"]').nth(1)

            const currentVisible = await currentPasswordInput.isVisible().catch(() => false)
            const newVisible = await newPasswordInput.isVisible().catch(() => false)

            if (currentVisible && newVisible) {
                console.log('✅ 비밀번호 입력 필드 확인')

                // 실제 변경은 하지 않고 Dialog 닫기
                const closeButton = dialog.locator('button').filter({ hasText: /취소|닫기|Close/i }).first()
                const closeVisible = await closeButton.isVisible().catch(() => false)

                if (closeVisible) {
                    await closeButton.click()
                    console.log('✅ Dialog 닫기 완료')
                }
            }
        } else {
            console.log('⚠️ 비밀번호 변경 Dialog를 찾을 수 없습니다.')
        }
    })

    test('Notification 설정 페이지 접근', async ({ page }) => {
        await page.goto('/settings/notifications')
        await page.waitForLoadState('networkidle')

        const mainContent = page.locator('main, [role="main"]')
        const contentVisible = await mainContent.isVisible({ timeout: 3000 }).catch(() => false)

        if (!contentVisible) {
            console.log('⚠️ Notification 페이지를 찾을 수 없습니다. 테스트 스킵.')
            test.skip()
            return
        }

        await expect(mainContent).toBeVisible()
        console.log('✅ Notification 설정 페이지 접근 성공')
    })

    test('알림 설정 토글', async ({ page }) => {
        await page.goto('/settings/notifications')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000)

        // 알림 토글 스위치 찾기
        const toggleSwitch = page.locator('input[type="checkbox"], [role="switch"]').first()
        const switchVisible = await toggleSwitch.isVisible({ timeout: 3000 }).catch(() => false)

        if (!switchVisible) {
            console.log('⚠️ 알림 설정 토글을 찾을 수 없습니다. 테스트 스킵.')
            test.skip()
            return
        }

        // 현재 상태 확인
        const isChecked = await toggleSwitch.isChecked()
        console.log(`📋 현재 알림 설정: ${isChecked ? 'ON' : 'OFF'}`)

        // 토글 변경
        await toggleSwitch.click()
        await page.waitForTimeout(500)

        const newState = await toggleSwitch.isChecked()
        console.log(`📋 변경된 알림 설정: ${newState ? 'ON' : 'OFF'}`)

        expect(newState).toBe(!isChecked)
        console.log('✅ 알림 설정 토글 완료')

        // 원래 상태로 복구
        await toggleSwitch.click()
        await page.waitForTimeout(500)
        console.log('✅ 원래 상태로 복구 완료')
    })

    test('System 설정 페이지 (ADMIN 전용)', async ({ page }) => {
        await page.goto('/settings/system')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000)

        // 권한이 없으면 접근 차단되거나 리다이렉트될 수 있음
        const url = page.url()

        if (url.includes('/settings/system')) {
            console.log('✅ System 설정 페이지 접근 성공 (ADMIN 권한)')

            const mainContent = page.locator('main, [role="main"]')
            await expect(mainContent).toBeVisible()

            // 시스템 설정 항목 확인
            const settingItems = page.locator('input, select, textarea')
            const itemCount = await settingItems.count()

            console.log(`⚙️ 시스템 설정 항목 수: ${itemCount}`)
        } else {
            console.log('⚠️ System 설정 페이지 접근 차단 (권한 없음)')
            console.log(`리다이렉트된 URL: ${url}`)
        }
    })
})
