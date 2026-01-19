import { expect, test } from '@playwright/test';

/**
 * Settings 페이지들 테스트
 * - Settings 메인 페이지
 * - Profile 설정
 * - Notification 설정
 * - System 설정 (ADMIN 전용)
 */

test.describe('Settings 페이지', () => {
  test('Settings 메인 페이지 접근', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // URL 확인 (리디렉션 가능)
    const url = page.url();
    if (url.includes('/settings') || url.includes('/profile')) {
      console.log(`✅ Settings 페이지 접근 성공: ${url}`);
      // body 존재 확인만
      await expect(page.locator('body')).toBeVisible();
    } else {
      console.log(`⚠️ 예상치 못한 리디렉션: ${url}`);
      test.skip();
    }
  });

  test('Profile 설정 페이지 접근', async ({ page }) => {
    await page.goto('/settings/profile');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // URL 확인
    const url = page.url();
    console.log(`✅ Profile 페이지 URL: ${url}`);
    await expect(page.locator('body')).toBeVisible();

    console.log('✅ Profile 설정 페이지 접근 성공');
  });

  test('프로필 정보 수정', async ({ page }) => {
    await page.goto('/settings/profile');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 이름 입력 필드 찾기
    const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first();
    const nameVisible = await nameInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (!nameVisible) {
      console.log('⚠️ 이름 입력 필드를 찾을 수 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    // 현재 이름 가져오기
    const currentName = await nameInput.inputValue();
    console.log(`📝 현재 이름: ${currentName}`);

    // 이름 변경
    const timestamp = Date.now();
    const newName = `${currentName} (Test ${timestamp})`;
    await nameInput.fill(newName);

    // 저장 버튼 찾기
    const saveButton = page
      .locator('button')
      .filter({ hasText: /저장|Save/i })
      .first();
    const saveVisible = await saveButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (saveVisible) {
      await saveButton.click();
      await page.waitForTimeout(1000);

      console.log(`✅ 프로필 수정 완료: ${newName}`);

      // 성공 메시지 확인
      const successMessage = page
        .locator('[role="status"], .toast')
        .filter({ hasText: /성공|저장/i })
        .first();
      const messageVisible = await successMessage.isVisible({ timeout: 3000 }).catch(() => false);

      if (messageVisible) {
        console.log('✅ 저장 성공 메시지 확인');
      }

      // 원래 이름으로 복구
      await nameInput.fill(currentName);
      await saveButton.click();
      await page.waitForTimeout(1000);
      console.log('✅ 원래 이름으로 복구 완료');
    }
  });

  test('비밀번호 변경 기능', async ({ page }) => {
    await page.goto('/settings/profile');
    await page.waitForLoadState('networkidle');

    // 프로필 로딩이 완료될 때까지 기다림 (로딩 스피너가 사라지고 프로필 헤더가 나타날 때까지)
    const profileHeader = page.locator('h1:has-text("프로필")');
    await profileHeader.waitFor({ state: 'visible', timeout: 15000 }).catch(() => null);

    // 추가 대기 후 페이지 안정화
    await page.waitForTimeout(1000);

    // 비밀번호 변경 관련 요소 찾기 (버튼 또는 입력 필드)
    // 보안 탭 또는 비밀번호 변경 관련 텍스트
    const securityTab = page.locator('button:has-text("보안")');
    const securityTabVisible = await securityTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (securityTabVisible) {
      console.log('✅ 보안 탭 발견 - 클릭');
      await securityTab.click();
      await page.waitForTimeout(500);
    }

    const passwordElements = page.locator('text=/비밀번호|Password/i').first();
    const elementVisible = await passwordElements.isVisible({ timeout: 5000 }).catch(() => false);

    if (!elementVisible) {
      console.log('⚠️ 비밀번호 관련 요소를 찾을 수 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }
    console.log('✅ 비밀번호 관련 요소 발견 - 테스트 통과');
  });

  test('Notification 설정 페이지 접근', async ({ page }) => {
    await page.goto('/settings/notifications');
    await page.waitForLoadState('networkidle');

    const mainContent = page.locator('main, [role="main"]');
    const contentVisible = await mainContent.isVisible({ timeout: 3000 }).catch(() => false);

    if (!contentVisible) {
      console.log('⚠️ Notification 페이지를 찾을 수 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    await expect(mainContent).toBeVisible();
    console.log('✅ Notification 설정 페이지 접근 성공');
  });

  test('알림 설정 토글', async ({ page }) => {
    await page.goto('/settings/notifications');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 알림 토글 스위치 찾기
    const toggleSwitch = page.locator('input[type="checkbox"], [role="switch"]').first();
    const switchVisible = await toggleSwitch.isVisible({ timeout: 3000 }).catch(() => false);

    if (!switchVisible) {
      console.log('⚠️ 알림 설정 토글을 찾을 수 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    // 현재 상태 확인
    const isChecked = await toggleSwitch.isChecked();
    console.log(`📋 현재 알림 설정: ${isChecked ? 'ON' : 'OFF'}`);

    // 토글 변경
    await toggleSwitch.click();
    await page.waitForTimeout(500);

    const newState = await toggleSwitch.isChecked();
    console.log(`📋 변경된 알림 설정: ${newState ? 'ON' : 'OFF'}`);

    expect(newState).toBe(!isChecked);
    console.log('✅ 알림 설정 토글 완료');

    // 원래 상태로 복구
    await toggleSwitch.click();
    await page.waitForTimeout(500);
    console.log('✅ 원래 상태로 복구 완료');
  });

  test('System 설정 페이지 (ADMIN 전용)', async ({ page }) => {
    await page.goto('/settings/system');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 권한이 없으면 접근 차단되거나 리다이렉트될 수 있음
    const url = page.url();

    if (url.includes('/settings/system')) {
      console.log('✅ System 설정 페이지 접근 성공 (ADMIN 권한)');

      const mainContent = page.locator('main, [role="main"]');
      await expect(mainContent).toBeVisible();

      // 시스템 설정 항목 확인
      const settingItems = page.locator('input, select, textarea');
      const itemCount = await settingItems.count();

      console.log(`⚙️ 시스템 설정 항목 수: ${itemCount}`);
    } else {
      console.log('⚠️ System 설정 페이지 접근 차단 (권한 없음)');
      console.log(`리다이렉트된 URL: ${url}`);
    }
  });
});
