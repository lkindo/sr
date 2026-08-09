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
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({
      timeout: 10000,
    });
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

  test('권한 관리 버튼이 그 역할의 권한 설정을 연다', async ({ page }) => {
    await page.goto('/roles', { waitUntil: 'domcontentloaded' });

    const firstRole = page.locator('tbody tr').first();
    await expect(firstRole).toBeVisible({ timeout: 10000 });
    const roleName = ((await firstRole.locator('td').first().textContent()) ?? '').trim();
    expect(roleName, '역할 이름을 읽지 못했습니다.').not.toBe('');

    // '권한 관리' 버튼은 RoleTable 에 항상 있다(src/components/roles/RoleTable.tsx).
    // 예전에는 못 찾으면 행을 클릭해 상세로 가는 척했는데 /roles/[id] 라우트는
    // 존재하지 않는다 — 즉 버튼이 사라져도, 다이얼로그가 안 열려도 통과했다.
    await firstRole.getByRole('button', { name: '권한 관리' }).click();

    // 다이얼로그 제목에 **그 역할 이름**이 있어야 한다. 아무 다이얼로그나 열린 것이
    // 아니라 고른 행의 권한 설정이 열렸음을 확인한다.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`권한 설정 - ${roleName}`)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
