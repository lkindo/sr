import { test, expect } from '@playwright/test'

/**
 * 인증 플로우 테스트
 * 주의: 이 테스트를 실행하기 전에 데이터베이스에 테스트 사용자가 있어야 합니다.
 */
test.describe('인증 플로우', () => {
  test('회원가입 플로우 - CLIENT 계정', async ({ page }) => {
    await page.goto('/register')

    // 고유한 이메일 생성
    const timestamp = Date.now()
    const randomNum = Math.floor(Math.random() * 10000)
    const testEmail = `client${timestamp}${randomNum}@example.com`
    const testPassword = 'TestPassword123!'

    // 페이지 로드 확인 (더 구체적인 선택자 사용)
    await expect(page.locator('.text-2xl').filter({ hasText: '회원가입' })).toBeVisible({ timeout: 20000 })

    // 1. 기본 정보 입력
    await page.fill('#name', 'E2E Test Client User')
    await page.fill('#email', testEmail)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)

    // 2. 계정 유형 선택 - CLIENT (기본값이므로 이미 선택됨)
    // CLIENT 라디오 버튼이 선택되어 있는지 확인
    const clientRadio = page.locator('#client')
    await expect(clientRadio).toBeChecked()

    // 3. 고객사 선택 대기 및 선택
    await page.waitForTimeout(1000) // 고객사 목록 로딩 대기

    // 고객사 선택 드롭다운이 표시되는지 확인
    const clientSelect = page.locator('#client-select')
    await expect(clientSelect).toBeVisible({ timeout: 5000 })

    // 첫 번째 고객사 선택
    await clientSelect.click()
    await page.waitForTimeout(500)

    // 드롭다운에서 첫 번째 옵션 선택
    const firstClient = page.locator('[role="option"]').first()
    if (await firstClient.isVisible()) {
      await firstClient.click()
    }

    // 4. 제출
    await page.click('button[type="submit"]')

    // 제출 후 대기
    await page.waitForTimeout(3000)

    // 로그인 페이지로 리디렉션 확인 (회원가입 성공)
    await page.waitForURL('/login', { timeout: 15000 })
    await expect(page).toHaveURL('/login')

    console.log(`✅ CLIENT 회원가입 성공: ${testEmail}`)
  })

  test('회원가입 플로우 - ENGINEER 계정', async ({ page }) => {
    await page.goto('/register')

    // 고유한 이메일 생성
    const timestamp = Date.now()
    const randomNum = Math.floor(Math.random() * 10000)
    const testEmail = `engineer${timestamp}${randomNum}@example.com`
    const testPassword = 'TestPassword123!'

    // 페이지 로드 확인 (더 구체적인 선택자 사용)
    await expect(page.locator('.text-2xl').filter({ hasText: '회원가입' })).toBeVisible({ timeout: 20000 })

    // 1. 기본 정보 입력
    await page.fill('#name', 'E2E Test Engineer')
    await page.fill('#email', testEmail)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)

    // 2. 계정 유형 선택 - ENGINEER
    const engineerLabel = page.locator('label[for="engineer"]')
    await engineerLabel.click()
    await page.waitForTimeout(500)

    // ENGINEER 라디오 버튼이 선택되었는지 확인
    const engineerRadio = page.locator('#engineer')
    await expect(engineerRadio).toBeChecked()

    // 3. 관리자 승인 안내 메시지 확인
    await expect(page.locator('text=/관리자 승인/')).toBeVisible()

    // 4. 제출
    await page.click('button[type="submit"]')

    // 제출 후 잠시 대기
    await page.waitForTimeout(2000)

    // 현재 URL 로깅
    console.log('제출 후 현재 URL:', page.url())

    // 에러가 있는지 확인
    const errorAlerts = await page.locator('[role="alert"]').all()
    console.log(`총 ${errorAlerts.length}개의 alert 발견`)

    for (let i = 0; i < errorAlerts.length; i++) {
      const text = await errorAlerts[i].textContent()
      const classes = await errorAlerts[i].getAttribute('class')
      console.log(`Alert ${i + 1}:`, text?.substring(0, 100), 'Classes:', classes)
    }

    // Destructive 에러 체크
    const hasDestructiveError = await page.locator('[role="alert"]').filter({ hasText: /오류.*/ }).first().isVisible().catch(() => false)
    if (hasDestructiveError) {
      const errorText = await page.locator('[role="alert"]').filter({ hasText: /오류.*/ }).first().textContent()
      console.log('❌ 에러 발생:', errorText)
      throw new Error(`회원가입 실패: ${errorText}`)
    }

    // 성공 메시지 확인 후 리디렉션 대기
    const successVisible = await page.locator('text=/회원가입이 완료되었습니다/i').isVisible({ timeout: 10000 }).catch(() => false)
    if (successVisible) {
      console.log('✅ 성공 메시지 확인')
      // 성공 메시지 후 2초 대기 (자동 리디렉션)
      await page.waitForTimeout(2500)
      console.log('성공 메시지 후 현재 URL:', page.url())
    } else {
      console.log('⚠️ 성공 메시지를 찾을 수 없음. 현재 URL:', page.url())
    }

    // 로그인 페이지로 리디렉션 확인
    await page.waitForURL('/login', { timeout: 10000 })
    await expect(page).toHaveURL('/login')
    console.log(`✅ ENGINEER 회원가입 성공 (승인 대기): ${testEmail}`)
  })

  test('로그인 플로우 - 잘못된 자격 증명', async ({ page }) => {
    await page.goto('/login')

    // 잘못된 자격 증명으로 로그인 시도
    await page.fill('#email', 'invalid@example.com')
    await page.fill('#password', 'wrongpassword')
    await page.click('button[type="submit"]')

    // 제출 후 대기
    await page.waitForTimeout(2000)

    // 에러 메시지 확인 (여러 가능한 셀렉터 시도)
    const errorVisible = await Promise.race([
      page.locator('text=/오류|에러|실패|잘못|Invalid|incorrect/i').isVisible(),
      page.locator('[role="alert"]').isVisible(),
      page.locator('.text-destructive').isVisible(),
      page.locator('.bg-destructive').isVisible(),
    ]).catch(() => false)

    // 페이지가 여전히 로그인 페이지에 있는지 확인 (로그인 실패)
    const stillOnLogin = page.url().includes('/login')

    // 에러가 표시되거나 로그인 페이지에 남아있으면 성공
    expect(errorVisible || stillOnLogin).toBeTruthy()
  })

  test('로그인 플로우 - 성공', async ({ page }) => {
    // 브라우저 컨텍스트 쿠키 초기화 (깨끗한 상태에서 시작)
    await page.context().clearCookies()

    await page.goto('/login')

    // 로그인 페이지 로드 확인
    await expect(page.locator('.text-2xl').filter({ hasText: '로그인' })).toBeVisible({ timeout: 10000 })

    // 테스트 사용자로 로그인
    await page.fill('#email', process.env.TEST_USER_EMAIL || 'admin@example.com')
    await page.fill('#password', process.env.TEST_USER_PASSWORD || 'password123')
    await page.click('button[type="submit"]')

    // 제출 후 대기
    await page.waitForTimeout(3000)

    // 대시보드 또는 다른 페이지로 리디렉션 확인
    const currentUrl = page.url()
    console.log('After login, current URL:', currentUrl)

    // 로그인 페이지를 벗어났는지 확인 (성공)
    const leftLoginPage = !currentUrl.includes('/login')

    if (leftLoginPage) {
      // 대시보드로 이동했는지 확인
      if (currentUrl.includes('/dashboard')) {
        await expect(page.locator('text=/대시보드|Dashboard/')).toBeVisible({ timeout: 10000 })
      } else {
        // 다른 페이지로 이동했어도 로그인 성공으로 간주
        console.log('Logged in successfully, redirected to:', currentUrl)
      }
    } else {
      // 여전히 로그인 페이지에 있으면 대시보드로 수동 이동 시도
      await page.goto('/dashboard')
      await page.waitForLoadState('domcontentloaded')

      // 대시보드에 접근 가능하면 로그인 성공
      const canAccessDashboard = !page.url().includes('/login')

      if (!canAccessDashboard) {
        // 로그인 실패 시 에러 메시지 확인
        const errorText = await page.locator('[role="alert"]').textContent().catch(() => null)
        console.log('❌ 로그인 실패. 현재 URL:', page.url())
        if (errorText) console.log('❌ 에러 메시지:', errorText)
      }

      expect(canAccessDashboard).toBeTruthy()
    }
  })
})

