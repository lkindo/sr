import { expect, type Page, test } from '@playwright/test';
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

/** 데스크톱 표에서 이름이 정확히 `name` 인 역할 행. 'ADMIN' 이 'CLIENT_ADMIN' 에 걸리지 않게 exact 로 찾는다. */
function roleRow(page: Page, name: string) {
  return page
    .locator('table:not([data-skeleton]):visible tbody tr')
    .filter({ has: page.getByRole('cell', { name, exact: true }) });
}

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

    // 첫 행이 아니라 MANAGER 행을 쓴다 — 첫 행은 보통 ADMIN 인데, ADMIN 역할은 권한까지 잠겨 있어
    // 버튼이 비활성이다(헌법 §1.4). 기본 역할의 권한 구성은 ADMIN 이 조정하는 기본값이다.
    const roleName = 'MANAGER';
    const managerRow = roleRow(page, roleName);
    await expect(managerRow).toBeVisible({ timeout: 10000 });

    // '권한 관리' 버튼은 RoleTable 에 항상 있다(src/components/roles/RoleTable.tsx).
    // 예전에는 못 찾으면 행을 클릭해 상세로 가는 척했는데 /roles/[id] 라우트는
    // 존재하지 않는다 — 즉 버튼이 사라져도, 다이얼로그가 안 열려도 통과했다.
    await managerRow.getByRole('button', { name: '권한 관리' }).click();

    // 다이얼로그 제목에 **그 역할 이름**이 있어야 한다. 아무 다이얼로그나 열린 것이
    // 아니라 고른 행의 권한 설정이 열렸음을 확인한다.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`권한 설정 - ${roleName}`)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  /**
   * 기본 역할 5개는 ADMIN 도 이름을 바꾸거나 지울 수 없다(헌법 §1.4, 2026-09-18 소유자 결정 RB-12).
   * 세션·정책·메뉴·알림이 역할 이름으로 판정하므로 개명은 그 역할 사용자 전원의 인가 해제다.
   */
  test('기본 역할은 삭제·개명이 잠겨 있고 ADMIN 역할은 수정·권한 관리도 잠겨 있다', async ({
    page,
  }) => {
    await page.goto('/roles', { waitUntil: 'domcontentloaded' });

    const adminRow = roleRow(page, 'ADMIN');
    await expect(adminRow).toBeVisible({ timeout: 10000 });
    await expect(adminRow.getByRole('button', { name: '수정' })).toBeDisabled();
    await expect(adminRow.getByRole('button', { name: '권한 관리' })).toBeDisabled();
    await expect(adminRow.getByRole('button', { name: '삭제' })).toBeDisabled();

    // 사용자 수와 무관하게 기본 역할은 삭제 버튼이 잠긴다.
    for (const name of ['MANAGER', 'ENGINEER', 'CLIENT_ADMIN', 'CLIENT_USER']) {
      await expect(roleRow(page, name).getByRole('button', { name: '삭제' }), name).toBeDisabled();
    }

    // 다른 기본 역할은 설명을 고칠 수 있지만 이름 칸은 잠겨 있다.
    await roleRow(page, 'ENGINEER').getByRole('button', { name: '수정' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('역할 이름 *')).toBeDisabled();
    await expect(dialog.getByLabel('역할 이름 *')).toHaveValue('ENGINEER');
    await expect(
      dialog.getByText('기본 역할의 이름은 바꿀 수 없습니다.', { exact: false })
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('기본 역할 이름(대소문자 무시)으로 새 역할을 만들면 서버가 거부한다', async ({ page }) => {
    await page.goto('/roles', { waitUntil: 'domcontentloaded' });
    await expect(roleRow(page, 'MANAGER')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: '등록', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('역할 이름 *').fill('manager');
    await dialog.getByRole('button', { name: '저장' }).click();

    // 서버 액션(role.service.createRole → policies.ensureRoleNameAllowed)의 거부 문구가 토스트로 온다.
    await expect(page.getByText('기본 역할 이름(manager)은 쓸 수 없습니다.').first()).toBeVisible();

    // 거부는 '토스트가 떴다' 가 아니라 '역할이 안 생겼다' 로 확인한다.
    const response = await page.request.get('/api/roles');
    expect(response.status()).toBe(200);
    const roles = (await response.json()) as Array<{ name: string }>;
    expect(roles.map((role) => role.name)).not.toContain('manager');
  });
});
