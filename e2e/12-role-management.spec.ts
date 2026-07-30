import { expect, test } from '@playwright/test';
import path from 'path';

/**
 * 역할 관리 테스트 - ADMIN 전용 기능
 *
 * 역할 관리는 ADMIN만 접근 가능한 기능
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. 그래서 "500ms 동안 네트워크 요청 0건"이라는 networkidle 조건은
 * 영원히 성립하지 않고 waitForLoadState('networkidle') 는 항상 30초 뒤 타임아웃난다.
 * 대신 (1) domcontentloaded 로 내비게이션만 확정하고, (2) 실제로 필요한 것
 * (목록 API 응답 / 요소 표시)을 기다린다. expect().toBeVisible() 은 자동 재시도한다.
 */

const authFiles = {
  admin: path.join(__dirname, '../playwright/.auth/user.json'),
};

test.describe('역할 관리 - ADMIN 권한', () => {
  test.use({ storageState: authFiles.admin });

  test('역할 목록 페이지 접근', async ({ page }) => {
    await page.goto('/roles', { waitUntil: 'domcontentloaded' });

    // ADMIN은 역할 목록 테이블이 보여야 함
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    console.log('✅ ADMIN: 역할 목록 테이블 확인');
  });

  test('역할 등록 버튼이 보여야 함', async ({ page }) => {
    await page.goto('/roles', { waitUntil: 'domcontentloaded' });

    // ADMIN은 역할 등록 버튼이 반드시 보여야 함
    const registerButton = page
      .locator('button')
      .filter({ hasText: /등록|Register|새|New|추가/i })
      .first();
    await expect(registerButton).toBeVisible({ timeout: 10000 });
    console.log('✅ ADMIN: 역할 등록 버튼 확인');
  });

  test('역할 상세 정보 확인', async ({ page }) => {
    await page.goto('/roles', { waitUntil: 'domcontentloaded' });

    // 첫 번째 역할 행이 반드시 있어야 함 (기본 역할: ADMIN, MANAGER 등)
    const firstRole = page.locator('tbody tr').first();
    await expect(firstRole).toBeVisible({ timeout: 10000 });

    // 역할 이름 확인
    const roleName = firstRole.locator('td').first();
    await expect(roleName).toBeVisible();

    // 권한 수 확인
    const permissionCount = firstRole.locator('td').nth(1);
    await expect(permissionCount).toBeVisible();

    const roleNameText = await roleName.textContent();
    console.log(`✅ 역할 확인: ${roleNameText}`);
  });

  test('역할별 권한 관리', async ({ page }) => {
    await page.goto('/roles', { waitUntil: 'domcontentloaded' });

    // 첫 번째 역할 행
    const firstRole = page.locator('tbody tr').first();
    await expect(firstRole).toBeVisible({ timeout: 10000 });

    // 권한 관리 버튼 또는 수정 버튼 찾기
    const actionButton = firstRole
      .locator('button')
      .filter({ hasText: /권한|Permission|수정|Edit/i })
      .first();

    if (await actionButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await actionButton.click();
      await page.waitForTimeout(500);

      // Dialog 또는 상세 페이지 확인
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('✅ 권한 관리 Dialog 열림');

        // Dialog 닫기
        await page.keyboard.press('Escape');
      }
    } else {
      // 행 클릭으로 상세 페이지 이동 시도
      await firstRole.click();
      await page.waitForTimeout(500);

      if (page.url().includes('/roles/')) {
        console.log('✅ 역할 상세 페이지로 이동');
      }
    }
  });
});
