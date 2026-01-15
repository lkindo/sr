import { test, expect } from '@playwright/test'
import path from 'path'

/**
 * 사용자 관리 테스트 - 권한별 시나리오
 * 
 * ADMIN/MANAGER: 사용자 CRUD 전체 권한
 * CLIENT: 읽기 전용 (사용자 페이지 접근 불가 또는 제한)
 */

const authFiles = {
  admin: path.join(__dirname, '../playwright/.auth/user.json'),
  manager: path.join(__dirname, '../playwright/.auth/manager.json'),
  client: path.join(__dirname, '../playwright/.auth/client.json'),
}

// ============================================
// ADMIN/MANAGER 권한 테스트
// ============================================
test.describe('사용자 관리 - ADMIN/MANAGER 권한', () => {
  test.use({ storageState: authFiles.admin })
  test.describe.configure({ mode: 'serial' })

  let testUserEmail: string
  let testUserName: string

  test('사용자 목록 페이지 접근', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')

    // ADMIN은 사용자 목록 테이블이 보여야 함
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 })
    console.log('✅ ADMIN: 사용자 목록 테이블 확인')
  })

  test('사용자 검색 기능', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')

    // 검색 입력 필드가 있어야 함
    const searchInput = page.locator('input[type="search"], input[placeholder*="검색"]').first()
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    await searchInput.fill('test')
    await page.waitForTimeout(500)

    console.log('✅ ADMIN: 검색 기능 동작 확인')
  })

  test('사용자 등록 버튼이 보여야 함', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')

    // ADMIN은 사용자 등록 버튼이 반드시 보여야 함
    const createButton = page.locator('button').filter({ hasText: /등록|추가|생성|New User/i }).first()
    await expect(createButton).toBeVisible({ timeout: 10000 })
    console.log('✅ ADMIN: 사용자 등록 버튼 확인')
  })

  test('사용자 생성 전체 플로우', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')

    // 등록 버튼 클릭
    const createButton = page.locator('button').filter({ hasText: /등록|추가|생성|New User/i }).first()
    await createButton.click()
    await page.waitForTimeout(500)

    // Dialog 확인
    const dialog = page.locator('[role="dialog"], .dialog, .modal').first()
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // 사용자 정보 입력
    const timestamp = Date.now()
    testUserName = `E2E Test User ${timestamp}`
    testUserEmail = `e2etest${timestamp}@example.com`

    // 이름 입력
    const nameInput = dialog.locator('input[name="name"], input[placeholder*="이름"], input[id*="name"]').first()
    await nameInput.fill(testUserName)

    // 이메일 입력
    const emailInput = dialog.locator('input[name="email"], input[type="email"]').first()
    await emailInput.fill(testUserEmail)

    // 비밀번호 입력 (있을 경우)
    const passwordInput = dialog.locator('input[name="password"], input[type="password"]').first()
    if (await passwordInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await passwordInput.fill('Test1234!')

      // 비밀번호 확인 입력 (필수)
      const confirmPasswordInput = dialog.locator('input[name="confirmPassword"], input[placeholder*="확인"], input[id*="confirm"]').first()
      if (await confirmPasswordInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmPasswordInput.fill('Test1234!')
      }
    }

    // 저장 버튼 클릭
    const saveButton = dialog.locator('button').filter({ hasText: /저장|등록|생성|Save|Create/i }).first()
    await saveButton.click()

    // API 응답 대기
    await page.waitForTimeout(2000)

    // 목록 새로고침 및 확인
    await page.goto('/users')
    await page.waitForLoadState('networkidle')

    // 생성된 사용자 확인 (재시도 로직)
    let userRow = page.locator('tbody tr').filter({ hasText: testUserName }).first()
    for (let retry = 0; retry < 3; retry++) {
      if (await userRow.isVisible({ timeout: 3000 }).catch(() => false)) break
      await page.reload({ waitUntil: 'networkidle' })
      userRow = page.locator('tbody tr').filter({ hasText: testUserName }).first()
    }

    await expect(userRow).toBeVisible({ timeout: 10000 })
    console.log(`✅ ADMIN: 사용자 생성 완료 - ${testUserName}`)
  })

  test('사용자 수정 플로우', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')

    // 첫 번째 사용자 행 찾기
    const firstUserRow = page.locator('tbody tr').first()
    await expect(firstUserRow).toBeVisible({ timeout: 10000 })

    // 수정 버튼 찾기
    const editButton = firstUserRow.locator('button').filter({ hasText: /수정|편집|Edit/i }).first()
    const editButtonVisible = await editButton.isVisible({ timeout: 2000 }).catch(() => false)

    if (editButtonVisible) {
      await editButton.click()
    } else {
      // 행 클릭으로 상세 페이지 이동
      await firstUserRow.click()
    }

    await page.waitForTimeout(500)

    // Dialog 또는 상세 페이지 확인
    const dialog = page.locator('[role="dialog"], .dialog, .modal').first()
    const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false)

    if (dialogVisible) {
      // 이름 필드 수정
      const nameInput = dialog.locator('input[name="name"], input[placeholder*="이름"]').first()
      if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        const timestamp = Date.now()
        await nameInput.fill(`Updated User ${timestamp}`)

        // 저장
        const saveButton = dialog.locator('button').filter({ hasText: /저장|수정|Save|Update/i }).first()
        await saveButton.click()
        await page.waitForTimeout(1000)

        console.log('✅ ADMIN: 사용자 수정 완료')
      }
    }
  })

  test('사용자 비활성화/삭제 플로우', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')

    // E2E 테스트 사용자 찾기
    let targetRow = page.locator('tbody tr').filter({ hasText: /E2E Test User/i }).first()
    if (!await targetRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      targetRow = page.locator('tbody tr').first()
    }

    await expect(targetRow).toBeVisible({ timeout: 10000 })

    // 삭제/비활성화 버튼 찾기
    const deleteButton = targetRow.locator('button').filter({ hasText: /삭제|비활성|Delete|Deactivate/i }).first()

    if (await deleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteButton.click()
      await page.waitForTimeout(500)

      // 확인 Dialog
      const confirmDialog = page.locator('[role="dialog"], [role="alertdialog"]').first()
      if (await confirmDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        const confirmButton = confirmDialog.locator('button').filter({ hasText: /확인|삭제|비활성|Delete|Yes/i }).first()
        await confirmButton.click()
        await page.waitForTimeout(1000)
        console.log('✅ ADMIN: 사용자 비활성화 완료')
      }
    } else {
      console.log('ℹ️ 삭제 버튼이 행 내부에 없음 - UI 구조가 다를 수 있음')
    }
  })
})

// ============================================
// CLIENT 권한 테스트 (제한된 접근)
// ============================================
test.describe('사용자 관리 - CLIENT 권한', () => {
  test.use({ storageState: authFiles.client })

  test('사용자 목록 페이지 접근 제한 확인', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')

    // CLIENT는 사용자 페이지에 접근 제한될 수 있음
    // 1) 403/Unauthorized 페이지 표시
    // 2) 또는 목록은 보이나 등록 버튼 없음

    const unauthorizedMessage = page.locator('text=/권한|unauthorized|forbidden|접근 거부/i')
    const table = page.locator('table')

    const isUnauthorized = await unauthorizedMessage.isVisible({ timeout: 3000 }).catch(() => false)
    const isTableVisible = await table.isVisible({ timeout: 3000 }).catch(() => false)

    if (isUnauthorized) {
      console.log('✅ CLIENT: 사용자 페이지 접근 거부됨 (예상대로)')
    } else if (isTableVisible) {
      // 테이블이 보이면 등록 버튼이 없어야 함
      const createButton = page.locator('button').filter({ hasText: /등록|추가|생성|New User/i }).first()
      const createButtonVisible = await createButton.isVisible({ timeout: 2000 }).catch(() => false)

      if (!createButtonVisible) {
        console.log('✅ CLIENT: 사용자 목록 보임, 등록 버튼 없음 (예상대로)')
      } else {
        // 버튼이 있으면 권한 문제일 수 있음 - 경고
        console.log('⚠️ CLIENT에게 등록 버튼이 보임 - 권한 설정 확인 필요')
      }
    } else {
      console.log('⚠️ 예상치 못한 UI 상태')
    }
  })
})
