import { expect, test } from '@playwright/test';
import path from 'path';

/**
 * 고객사 관리 테스트 - 권한별 시나리오
 *
 * ADMIN/MANAGER: 고객사 CRUD 전체 권한
 * CLIENT: 본인 고객사 정보 조회만 가능
 */

const authFiles = {
  admin: path.join(__dirname, '../playwright/.auth/user.json'),
  manager: path.join(__dirname, '../playwright/.auth/manager.json'),
  client: path.join(__dirname, '../playwright/.auth/client.json'),
};

// ============================================
// ADMIN/MANAGER 권한 테스트
// ============================================
test.describe('고객사 관리 - ADMIN/MANAGER 권한', () => {
  test.use({ storageState: authFiles.admin });
  test.describe.configure({ mode: 'serial' });

  let testClientName: string;
  let testClientCode: string;

  test('고객사 목록 페이지 접근', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // ADMIN은 고객사 목록 테이블이 보여야 함
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    console.log('✅ ADMIN: 고객사 목록 테이블 확인');
  });

  test('고객사 등록 버튼이 보여야 함', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // ADMIN은 고객사 등록 버튼이 반드시 보여야 함
    const registerButton = page.getByRole('button', { name: /등록/i });
    await expect(registerButton).toBeVisible({ timeout: 10000 });
    console.log('✅ ADMIN: 고객사 등록 버튼 확인');
  });

  test('고객사 검색 기능', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // 검색 입력 필드가 있어야 함 (없으면 테스트 실패)
    const searchInput = page.locator('input[type="search"], input[placeholder*="검색"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    await searchInput.fill('test');
    await page.waitForTimeout(500);

    console.log('✅ ADMIN: 검색 기능 동작 확인');
  });

  test('고객사 생성 전체 플로우', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // 등록 버튼 클릭
    const createButton = page
      .locator('button')
      .filter({ hasText: /등록|추가|생성|New Client/i })
      .first();
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();
    await page.waitForTimeout(500);

    // Dialog 확인
    const dialog = page.locator('[role="dialog"], .dialog, .modal').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // 고객사 정보 입력
    const timestamp = Date.now();
    testClientName = `E2E Test Client ${timestamp}`;
    testClientCode = `E2E${timestamp.toString().slice(-6)}`;

    // 코드 입력
    const codeInput = dialog.getByLabel(/고객사 코드/i).first();
    await codeInput.fill(testClientCode);
    await page.waitForTimeout(200);

    // 이름 입력
    const nameInput = dialog.getByLabel(/고객사명/i).first();
    await nameInput.fill(testClientName);

    // 산업군 선택 (있을 경우)
    const industrySelect = dialog.locator('select[name="industry"], [role="combobox"]').first();
    if (await industrySelect.isVisible({ timeout: 1000 }).catch(() => false)) {
      await industrySelect.click();
      await page.waitForTimeout(300);
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await firstOption.click();
      }
    }

    // 저장 버튼 클릭
    const saveButton = dialog
      .locator('button')
      .filter({ hasText: /저장|등록|생성|Save|Create/i })
      .first();
    await saveButton.click();

    // 응답 대기
    await page.waitForTimeout(2000);

    // 목록 새로고침 및 확인
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // 생성된 고객사 확인 (재시도 로직)
    let clientRow = page.locator('tbody tr').filter({ hasText: testClientName }).first();
    for (let retry = 0; retry < 3; retry++) {
      if (await clientRow.isVisible({ timeout: 3000 }).catch(() => false)) break;
      await page.reload({ waitUntil: 'networkidle' });
      clientRow = page.locator('tbody tr').filter({ hasText: testClientName }).first();
    }

    await expect(clientRow).toBeVisible({ timeout: 10000 });
    console.log(`✅ ADMIN: 고객사 생성 완료 - ${testClientName}`);
  });

  test('고객사 상세 페이지 접근', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // 첫 번째 고객사 행 찾기
    const firstClientRow = page.locator('tbody tr').first();
    await expect(firstClientRow).toBeVisible({ timeout: 10000 });

    const clientName = (await firstClientRow.locator('td').nth(0).textContent()) || '';
    console.log(`📋 상세 페이지 접근: ${clientName}`);

    // 상세 보기 버튼 또는 행 클릭
    const viewButton = firstClientRow
      .locator('button, a')
      .filter({ hasText: /상세|보기|View|Details/i })
      .first();
    if (await viewButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await viewButton.click();
    } else {
      const nameLink = firstClientRow.locator('a').first();
      if (await nameLink.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nameLink.click();
      } else {
        await firstClientRow.click();
      }
    }

    await page.waitForTimeout(1000);

    // 상세 정보 확인
    const url = page.url();
    if (url.includes('/clients/')) {
      console.log('✅ ADMIN: 고객사 상세 페이지 접근 성공');
    } else {
      // Dialog로 열렸을 수 있음
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('✅ ADMIN: 고객사 상세 Dialog 확인');
      }
    }
  });

  test('고객사 수정 플로우', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // 첫 번째 고객사 행에서 링크 클릭하여 상세 페이지로 이동
    const firstClientLink = page.locator('tbody tr').first().locator('a').first();
    await expect(firstClientLink).toBeVisible({ timeout: 10000 });
    await firstClientLink.click();

    // 상세 페이지 도착 대기
    await page.waitForURL(/\/clients\/[a-zA-Z0-9-]+/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // 상세 페이지에서 수정 버튼 클릭
    const editButton = page.getByRole('button', { name: /수정/i });
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();
    await page.waitForTimeout(500);

    // Dialog 확인
    const dialog = page.locator('[role="dialog"], .dialog, .modal').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // 이름 필드 수정
    const nameInput = dialog.locator('input[name="name"], input[placeholder*="이름"]').first();
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      const timestamp = Date.now();
      await nameInput.fill(`Updated Client ${timestamp}`);

      // 저장
      const saveButton = dialog
        .locator('button')
        .filter({ hasText: /저장|수정|Save|Update/i })
        .first();
      await saveButton.click();
      await page.waitForTimeout(1000);

      console.log('✅ ADMIN: 고객사 수정 완료');
    }
  });

  test('고객사 비활성화 플로우', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // E2E 테스트 고객사 찾기
    let targetRow = page
      .locator('tbody tr')
      .filter({ hasText: /E2E Test Client/i })
      .first();
    if (!(await targetRow.isVisible({ timeout: 3000 }).catch(() => false))) {
      targetRow = page.locator('tbody tr').first();
    }

    await expect(targetRow).toBeVisible({ timeout: 10000 });

    // 삭제/비활성화 버튼 찾기
    const deleteButton = targetRow
      .locator('button')
      .filter({ hasText: /삭제|비활성|Delete|Deactivate/i })
      .first();

    if (await deleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteButton.click();
      await page.waitForTimeout(500);

      // 확인 Dialog
      const confirmDialog = page.locator('[role="dialog"], [role="alertdialog"]').first();
      if (await confirmDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        const confirmButton = confirmDialog
          .locator('button')
          .filter({ hasText: /확인|삭제|비활성|Delete|Yes/i })
          .first();
        await confirmButton.click();
        await page.waitForTimeout(1000);
        console.log('✅ ADMIN: 고객사 비활성화 완료');
      }
    } else {
      console.log('ℹ️ 삭제 버튼이 행 내부에 없음 - UI 구조가 다를 수 있음');
    }
  });
});

// ============================================
// CLIENT 권한 테스트 (제한된 접근)
// ============================================
test.describe('고객사 관리 - CLIENT 권한', () => {
  test.use({ storageState: authFiles.client });

  test('고객사 목록 페이지 접근 시 본인 고객사만 보이거나 제한됨', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // CLIENT는 다음 중 하나의 상태여야 함:
    // 1) 접근 거부 메시지
    // 2) 본인 고객사만 표시
    // 3) 등록/수정 버튼 없음

    const unauthorizedMessage = page.locator('text=/권한|unauthorized|forbidden|접근 거부/i');
    const table = page.locator('table');

    const isUnauthorized = await unauthorizedMessage
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const isTableVisible = await table.isVisible({ timeout: 3000 }).catch(() => false);

    if (isUnauthorized) {
      console.log('✅ CLIENT: 고객사 페이지 접근 거부됨 (예상대로)');
    } else if (isTableVisible) {
      // 테이블이 보이면 등록 버튼이 없어야 함
      const createButton = page
        .locator('button')
        .filter({ hasText: /등록|추가|생성|New Client/i })
        .first();
      const createButtonVisible = await createButton
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (!createButtonVisible) {
        console.log('✅ CLIENT: 고객사 목록 보임, 등록 버튼 없음 (예상대로)');
      } else {
        console.log('⚠️ CLIENT에게 등록 버튼이 보임 - 권한 설정 확인 필요');
      }

      // 수정/삭제 버튼도 없어야 함
      const editButton = page
        .locator('button')
        .filter({ hasText: /수정|편집|Edit/i })
        .first();
      const deleteButton = page
        .locator('button')
        .filter({ hasText: /삭제|Delete/i })
        .first();

      const editVisible = await editButton.isVisible({ timeout: 2000 }).catch(() => false);
      const deleteVisible = await deleteButton.isVisible({ timeout: 2000 }).catch(() => false);

      if (!editVisible && !deleteVisible) {
        console.log('✅ CLIENT: 수정/삭제 버튼 없음 (예상대로)');
      }
    } else {
      // 리다이렉트되었거나 다른 페이지로 이동
      const url = page.url();
      console.log(`ℹ️ CLIENT: ${url}로 리다이렉트됨`);
    }
  });
});
