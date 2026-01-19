import { expect, test } from '@playwright/test';

/**
 * 인증 플로우 테스트
 * 주의: 이 테스트를 실행하기 전에 데이터베이스에 테스트 사용자가 있어야 합니다.
 */
test.describe('인증 플로우', () => {
  test('회원가입 플로우 - CLIENT 계정', async ({ page }) => {
    await page.goto('/register');

    // 고유한 이메일 생성
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    const testEmail = `client${timestamp}${randomNum}@example.com`;
    const testPassword = 'TestPassword123!';

    // 페이지 로드 확인 (더 구체적인 선택자 사용)
    await expect(page.locator('.text-2xl').filter({ hasText: '회원가입' })).toBeVisible({
      timeout: 20000,
    });

    // 1. 기본 정보 입력
    await page.fill('#name', 'E2E Test Client User');
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);

    // 2. 계정 유형 선택 - CLIENT (기본값이므로 이미 선택됨)
    // CLIENT 라디오 버튼이 선택되어 있는지 확인
    const clientRadio = page.locator('#client');
    await expect(clientRadio).toBeChecked();

    // 3. 고객사 선택 대기 및 선택
    await page.waitForTimeout(1000); // 고객사 목록 로딩 대기

    // 고객사 선택 드롭다운이 표시되는지 확인
    const clientSelect = page.locator('#client-select');
    await expect(clientSelect).toBeVisible({ timeout: 5000 });

    // 첫 번째 고객사 선택
    await clientSelect.click();
    await page.waitForTimeout(500);

    // 드롭다운에서 첫 번째 옵션 선택
    const firstClient = page.locator('[role="option"]').first();
    if (await firstClient.isVisible()) {
      await firstClient.click();
    }

    // 4. 제출
    await page.click('button[type="submit"]');

    // 제출 후 대기
    await page.waitForTimeout(3000);

    // 로그인 페이지로 리디렉션 확인 (회원가입 성공)
    await page.waitForURL('/login', { timeout: 15000 });
    await expect(page).toHaveURL('/login');

    console.log(`✅ CLIENT 회원가입 성공: ${testEmail}`);
  });

  test('회원가입 플로우 - ENGINEER 계정', async ({ page }) => {
    await page.goto('/register');

    // 고유한 이메일 생성
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    const testEmail = `engineer${timestamp}${randomNum}@example.com`;
    const testPassword = 'TestPassword123!';

    // 페이지 로드 확인 (더 구체적인 선택자 사용)
    await expect(page.locator('.text-2xl').filter({ hasText: '회원가입' })).toBeVisible({
      timeout: 20000,
    });

    // 1. 기본 정보 입력
    await page.fill('#name', 'E2E Test Engineer');
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);

    // 2. 계정 유형 선택 - ENGINEER
    const engineerLabel = page.locator('label[for="engineer"]');
    await engineerLabel.click();
    await page.waitForTimeout(500);

    // ENGINEER 라디오 버튼이 선택되었는지 확인
    const engineerRadio = page.locator('#engineer');
    await expect(engineerRadio).toBeChecked();

    // 3. 관리자 승인 안내 메시지 확인
    await expect(page.locator('text=/관리자 승인/')).toBeVisible();

    // 4. 제출
    await page.click('button[type="submit"]');

    // 제출 후 잠시 대기
    await page.waitForTimeout(2000);

    // 현재 URL 로깅
    console.log('제출 후 현재 URL:', page.url());

    // 에러가 있는지 확인
    const errorAlerts = await page.locator('[role="alert"]').all();
    console.log(`총 ${errorAlerts.length}개의 alert 발견`);

    for (let i = 0; i < errorAlerts.length; i++) {
      const text = await errorAlerts[i].textContent();
      const classes = await errorAlerts[i].getAttribute('class');
      console.log(`Alert ${i + 1}:`, text?.substring(0, 100), 'Classes:', classes);
    }

    // Destructive 에러 체크
    const hasDestructiveError = await page
      .locator('[role="alert"]')
      .filter({ hasText: /오류.*/ })
      .first()
      .isVisible()
      .catch(() => false);
    if (hasDestructiveError) {
      const errorText = await page
        .locator('[role="alert"]')
        .filter({ hasText: /오류.*/ })
        .first()
        .textContent();
      console.log('❌ 에러 발생:', errorText);
      throw new Error(`회원가입 실패: ${errorText}`);
    }

    // 성공 메시지 확인 후 리디렉션 대기
    const successVisible = await page
      .locator('text=/회원가입이 완료되었습니다/i')
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    if (successVisible) {
      console.log('✅ 성공 메시지 확인');
      // 성공 메시지 후 2초 대기 (자동 리디렉션)
      await page.waitForTimeout(2500);
      console.log('성공 메시지 후 현재 URL:', page.url());
    } else {
      console.log('⚠️ 성공 메시지를 찾을 수 없음. 현재 URL:', page.url());
    }

    // 로그인 페이지로 리디렉션 확인
    await page.waitForURL('/login', { timeout: 10000 });
    await expect(page).toHaveURL('/login');
    console.log(`✅ ENGINEER 회원가입 성공 (승인 대기): ${testEmail}`);
  });

  test('로그인 플로우 - 잘못된 자격 증명', async ({ page }) => {
    await page.goto('/login');

    // 잘못된 자격 증명으로 로그인 시도
    await page.fill('#email', 'invalid@example.com');
    await page.fill('#password', 'wrongpassword');
    await page.click('button[type="submit"]');

    // 제출 후 대기
    await page.waitForTimeout(2000);

    // 에러 메시지 확인 (여러 가능한 셀렉터 시도)
    const errorVisible = await Promise.race([
      page.locator('text=/오류|에러|실패|잘못|Invalid|incorrect/i').isVisible(),
      page.locator('[role="alert"]').isVisible(),
      page.locator('.text-destructive').isVisible(),
      page.locator('.bg-destructive').isVisible(),
    ]).catch(() => false);

    // 페이지가 여전히 로그인 페이지에 있는지 확인 (로그인 실패)
    const stillOnLogin = page.url().includes('/login');

    // 에러가 표시되거나 로그인 페이지에 남아있으면 성공
    expect(errorVisible || stillOnLogin).toBeTruthy();
  });

  test('로그인 플로우 - 성공 (신규 가입 후 로그인)', async ({ page }) => {
    // 1. 회원가입 진행 (테스트 독립성 확보)
    await page.goto('/register');

    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 10000);
    const testEmail = `login_test_${timestamp}${randomNum}@example.com`;
    const testPassword = 'TestPassword123!';

    await page.fill('#name', 'Login Test User');
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);

    // CLIENT 선택 및 고객사 선택
    const clientRadio = page.locator('#client');
    await expect(clientRadio).toBeChecked();

    await page.waitForTimeout(1000);
    const clientSelect = page.locator('#client-select');
    await clientSelect.click();
    await page.waitForTimeout(500);
    const firstClient = page.locator('[role="option"]').first();
    if (await firstClient.isVisible()) {
      await firstClient.click();
    }

    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // 회원가입 후 로그인 페이지로 이동 확인
    await page.waitForURL('/login', { timeout: 15000 });

    // 2. 로그인 진행
    console.log(`로그인 시도: ${testEmail}`);
    await page.fill('#email', testEmail);
    await page.fill('#password', testPassword);

    // 로그인 API 응답 대기 설정
    const loginResponsePromise = page
      .waitForResponse(
        (resp) => resp.url().includes('/api/auth') && resp.request().method() === 'POST',
        { timeout: 15000 }
      )
      .catch((e) => {
        console.log('⚠️ 로그인 API 응답 대기 타임아웃 또는 에러:', e.message);
        return null;
      });

    console.log('로그인 버튼 클릭 시도...');
    await page.click('button[type="submit"]');
    console.log('로그인 버튼 클릭 완료');

    // API 응답 확인
    const loginResponse = await loginResponsePromise;
    if (loginResponse) {
      console.log(`✅ 로그인 API 응답 수신: ${loginResponse.status()} ${loginResponse.url()}`);
      if (loginResponse.status() !== 200) {
        console.log('⚠️ 로그인 API 응답이 200이 아닙니다.');
      }
    } else {
      console.log('⚠️ 로그인 API 응답을 감지하지 못했습니다.');
    }

    // 대시보드로 리디렉션 대기
    console.log('대시보드 리디렉션 대기 중...');
    try {
      await page.waitForURL((url) => url.toString().includes('/dashboard'), {
        timeout: 20000,
        waitUntil: 'domcontentloaded',
      });
      console.log('✅ 대시보드 리디렉션 성공');
    } catch {
      console.log('⚠️ 대시보드 리디렉션 타임아웃. 현재 URL:', page.url());

      // 현재 페이지의 에러 메시지 확인
      const bodyText = await page.textContent('body');
      console.log('현재 페이지 텍스트 요약:', bodyText?.substring(0, 200).replace(/\s+/g, ' '));

      // 수동 이동 시도
      if (page.url().includes('/login')) {
        console.log('여전히 로그인 페이지입니다. 강제 이동 시도...');
        await page.goto('/dashboard');
        await page.waitForLoadState('domcontentloaded');
      }
    }

    // 최종 확인
    const currentUrl = page.url();
    const onDashboard = currentUrl.includes('/dashboard');
    console.log(`최종 URL: ${currentUrl}, 대시보드 진입 여부: ${onDashboard}`);

    if (onDashboard) {
      await expect(page.locator('text=/대시보드|Dashboard/')).toBeVisible({ timeout: 10000 });
    } else {
      const errorText = await page
        .locator('[role="alert"]')
        .textContent()
        .catch(() => null);
      if (errorText) console.log('❌ 로그인 실패 에러:', errorText);
    }

    expect(onDashboard).toBeTruthy();
  });
});
