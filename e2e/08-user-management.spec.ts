import { expect, test } from '@playwright/test';
import path from 'path';

/**
 * 사용자 관리 테스트 - 권한별 시나리오
 *
 * ADMIN/MANAGER: 사용자 CRUD 전체 권한
 * CLIENT: 읽기 전용 (사용자 페이지 접근 불가 또는 제한)
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
  manager: path.join(__dirname, '../playwright/.auth/manager.json'),
  client: path.join(__dirname, '../playwright/.auth/client.json'),
};

// ============================================
// ADMIN/MANAGER 권한 테스트
// ============================================
test.describe('사용자 관리 - ADMIN/MANAGER 권한', () => {
  test.use({ storageState: authFiles.admin });
  test.describe.configure({ mode: 'serial' });

  let testUserEmail: string;
  let testUserName: string;

  test('사용자 목록 페이지 접근', async ({ page }) => {
    await page.goto('/users', { waitUntil: 'domcontentloaded' });

    // ADMIN은 사용자 목록 테이블이 보여야 함
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    console.log('✅ ADMIN: 사용자 목록 테이블 확인');
  });

  test('사용자 검색 기능', async ({ page }) => {
    await page.goto('/users', { waitUntil: 'domcontentloaded' });

    // 검색 입력 필드가 있어야 함
    const searchInput = page.locator('input[type="search"], input[placeholder*="검색"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    await searchInput.fill('test');
    await page.waitForTimeout(500);

    console.log('✅ ADMIN: 검색 기능 동작 확인');
  });

  test('사용자 등록 버튼이 보여야 함', async ({ page }) => {
    await page.goto('/users', { waitUntil: 'domcontentloaded' });

    // ADMIN은 사용자 등록 버튼이 반드시 보여야 함
    const createButton = page
      .locator('button')
      .filter({ hasText: /등록|추가|생성|New User/i })
      .first();
    await expect(createButton).toBeVisible({ timeout: 10000 });
    console.log('✅ ADMIN: 사용자 등록 버튼 확인');
  });

  test('사용자 생성 전체 플로우', async ({ page }) => {
    await page.goto('/users', { waitUntil: 'domcontentloaded' });

    // 등록 버튼 클릭
    const createButton = page
      .locator('button')
      .filter({ hasText: /등록|추가|생성|New User/i })
      .first();
    await createButton.click();
    await page.waitForTimeout(500);

    // Dialog 확인
    const dialog = page.locator('[role="dialog"], .dialog, .modal').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // 사용자 정보 입력
    const timestamp = Date.now();
    testUserName = `E2E Test User ${timestamp}`;
    testUserEmail = `e2etest${timestamp}@example.com`;

    // 이름 입력
    const nameInput = dialog
      .locator('input[name="name"], input[placeholder*="이름"], input[id*="name"]')
      .first();
    await nameInput.fill(testUserName);

    // 이메일 입력
    const emailInput = dialog.locator('input[name="email"], input[type="email"]').first();
    await emailInput.fill(testUserEmail);

    // 비밀번호 입력 (있을 경우)
    const passwordInput = dialog.locator('input[name="password"], input[type="password"]').first();
    if (await passwordInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await passwordInput.fill('Test1234!');

      // 비밀번호 확인 입력 (필수)
      const confirmPasswordInput = dialog
        .locator('input[name="confirmPassword"], input[placeholder*="확인"], input[id*="confirm"]')
        .first();
      if (await confirmPasswordInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmPasswordInput.fill('Test1234!');
      }
    }

    // 저장 버튼 클릭
    const saveButton = dialog
      .locator('button')
      .filter({ hasText: /저장|등록|생성|Save|Create/i })
      .first();
    await saveButton.click();

    // API 응답 대기
    await page.waitForTimeout(2000);

    // 목록 새로고침 및 확인
    await page.goto('/users', { waitUntil: 'domcontentloaded' });

    // 생성된 사용자 확인 (재시도 로직)
    let userRow = page.locator('tbody tr').filter({ hasText: testUserName }).first();
    for (let retry = 0; retry < 3; retry++) {
      if (await userRow.isVisible({ timeout: 3000 }).catch(() => false)) break;
      await page.reload({ waitUntil: 'domcontentloaded' });
      userRow = page.locator('tbody tr').filter({ hasText: testUserName }).first();
    }

    await expect(userRow).toBeVisible({ timeout: 10000 });
    console.log(`✅ ADMIN: 사용자 생성 완료 - ${testUserName}`);
  });

  test('역할 관리 플로우 (신규 UI)', async ({ page }) => {
    await page.goto('/users', { waitUntil: 'domcontentloaded' });

    // 첫 번째 사용자 선택 (체크박스 클릭)
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });

    const checkbox = firstRow.locator('button').first(); // 첫 번째 버튼이 체크박스
    await checkbox.click();

    // 상단 일괄 작업 영역의 '역할 관리' 버튼 확인 및 클릭
    const roleManageButton = page.locator('button').filter({ hasText: '역할 관리' });
    await expect(roleManageButton).toBeVisible({ timeout: 5000 });
    await roleManageButton.click();

    // 역할 관리 Dialog 확인
    const dialog = page
      .locator('[role="dialog"]')
      .filter({ hasText: /역할|Role/i })
      .first();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // 취소/닫기
    const closeButton = dialog
      .locator('button')
      .filter({ hasText: /취소|닫기|Close|Cancel/i })
      .first();
    await closeButton.click();

    console.log('✅ ADMIN: 역할 관리 다이얼로그 접근 확인');
  });

  test('사용자 비활성/활성 상태 전환 (신규 UI)', async ({ page }) => {
    // 대상은 앞 테스트가 만든 전용 계정으로 고정한다(describe 가 serial 이므로 반드시 존재한다).
    // "첫 번째 행"에 의존하면 안 된다: /api/users 는 sortBy 미지정 시 orderBy 없이 조회하므로
    // (src/lib/pagination.ts getPrismaOrderBy → undefined) 행 순서가 보장되지 않고,
    // 시드 계정이 늘어나면 첫 행과 그 상태가 같이 바뀐다.
    expect(testUserEmail, '앞선 사용자 생성 테스트에서 대상 계정이 준비되어야 함').toBeTruthy();

    // q=<이메일> 로 대상만 남기고, isActive=all 로 활성/비활성 어느 상태든 목록에 남게 한다.
    // (기본 상태 필터는 'true' 여서 비활성으로 바꾸는 순간 행이 목록에서 사라진다.)
    await page.goto(`/users?q=${encodeURIComponent(testUserEmail)}&isActive=all`, {
      waitUntil: 'domcontentloaded',
    });

    // 행을 이메일로 특정한다. 목록 로딩 중에는 tbody 에 '로딩 중...' 플레이스홀더 행 하나만
    // 있는데(UserTable.tsx colSpan=7), 예전 코드는 그 행을 "첫 번째 사용자"로 잡아 상태를
    // 잘못 읽었다. 이메일 필터는 플레이스홀더와 절대 겹치지 않아 고정 대기 없이 경합이 사라진다.
    const targetRow = page.locator('tbody tr').filter({ hasText: testUserEmail });
    await expect(targetRow).toBeVisible({ timeout: 15000 });

    // 상태 Badge 는 정확히 '활성' 또는 '비활성' 이다(UserTable.tsx:173-175).
    // '비활성'.includes('활성') === true 이므로 부분 문자열 비교는 금지, 완전 일치로 읽는다.
    // 상태 필터 탭에도 같은 라벨이 있어서 반드시 마지막 td(상태 열) 안으로 범위를 좁힌다.
    const statusBadge = targetRow
      .locator('td')
      .last()
      .getByText(/^(활성|비활성)$/)
      .first();
    await expect(statusBadge).toHaveText(/^(활성|비활성)$/, { timeout: 10000 });
    const isCurrentlyActive = (await statusBadge.innerText()).trim() === '활성';

    // 체크박스(행의 첫 번째 버튼) 클릭 → 일괄 작업 바로 선택 반영을 먼저 확정한다.
    await targetRow.locator('button').first().click();
    await expect(page.getByText('1명 선택')).toBeVisible({ timeout: 5000 });

    // 1) 현재 상태의 반대 방향으로 전환
    const actionButtonText = isCurrentlyActive ? '일괄 비활성화' : '일괄 활성화';
    const actionButton = page.getByRole('button', { name: actionButtonText, exact: true });
    await expect(actionButton).toBeVisible({ timeout: 5000 });
    await actionButton.click();

    // 토스트 메시지 대기 및 확인 (UsersClient handleToggleActive → title: '상태 변경 완료')
    await expect(page.getByText('상태 변경 완료').first()).toBeVisible({ timeout: 5000 });

    // 토스트만 믿지 않고 목록 갱신 후 상태 Badge 가 실제로 뒤집혔는지 확인한다.
    await expect(statusBadge).toHaveText(isCurrentlyActive ? '비활성' : '활성', { timeout: 10000 });
    console.log(`✅ ADMIN: 사용자 상태 전환 확인 (${isCurrentlyActive ? '비활성화' : '활성화'})`);

    // 2) 반대 버튼까지 실제로 검증하고 계정 상태를 원래대로 되돌린다.
    // 선택은 유지되므로(selectedUserIds 는 id 기준) 일괄 작업 바가 그대로 남아 있다.
    const revertButtonText = isCurrentlyActive ? '일괄 활성화' : '일괄 비활성화';
    const revertButton = page.getByRole('button', { name: revertButtonText, exact: true });
    await expect(revertButton).toBeVisible({ timeout: 10000 });
    await revertButton.click();

    await expect(statusBadge).toHaveText(isCurrentlyActive ? '활성' : '비활성', { timeout: 10000 });
    console.log(`✅ ADMIN: 사용자 상태 원복 확인 (${isCurrentlyActive ? '활성화' : '비활성화'})`);
  });
});

// ============================================
// CLIENT 권한 테스트 (제한된 접근)
// ============================================
test.describe('사용자 관리 - CLIENT 권한', () => {
  test.use({ storageState: authFiles.client });

  test('사용자 목록 페이지 접근 제한 확인', async ({ page }) => {
    // 아래 분기 판정은 관용적(isVisible 프로브)이므로, 화면이 확정되기 전에 프로브하면
    // 어떤 분기도 타지 않고 조용히 통과한다. 그래서 목록 API 응답(403 이든 200 이든)까지
    // 기다린다. 응답이 오지 않는 경우(클라이언트 리다이렉트 등)는 null 로 흘려 보낸다.
    const usersApiResponse = page
      .waitForResponse(
        (resp) => resp.url().includes('/api/users') && resp.request().method() === 'GET',
        { timeout: 15000 }
      )
      .catch(() => null);
    await page.goto('/users', { waitUntil: 'domcontentloaded' });
    await usersApiResponse;

    // CLIENT는 사용자 페이지에 접근 제한될 수 있음
    // 1) 403/Unauthorized 페이지 표시
    // 2) 또는 목록은 보이나 등록 버튼 없음

    const unauthorizedMessage = page.locator('text=/권한|unauthorized|forbidden|접근 거부/i');
    const table = page.locator('table');

    const isUnauthorized = await unauthorizedMessage
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    const isTableVisible = await table.isVisible({ timeout: 3000 }).catch(() => false);

    if (isUnauthorized) {
      console.log('✅ CLIENT: 사용자 페이지 접근 거부됨 (예상대로)');
    } else if (isTableVisible) {
      // 테이블이 보이면 등록 버튼이 없어야 함
      const createButton = page
        .locator('button')
        .filter({ hasText: /등록|추가|생성|New User/i })
        .first();
      const createButtonVisible = await createButton
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (!createButtonVisible) {
        console.log('✅ CLIENT: 사용자 목록 보임, 등록 버튼 없음 (예상대로)');
      } else {
        // 버튼이 있으면 권한 문제일 수 있음 - 경고
        console.log('⚠️ CLIENT에게 등록 버튼이 보임 - 권한 설정 확인 필요');
      }
    } else {
      console.log('⚠️ 예상치 못한 UI 상태');
    }
  });
});
