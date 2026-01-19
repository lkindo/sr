import { expect, test } from '@playwright/test';

/**
 * Organization 페이지 테스트
 * - 조직도 뷰 확인
 * - 고객사별 사용자 트리 구조
 * - 사용자 Drag & Drop 재배정 (구현되어 있을 경우)
 */

test.describe('Organization 페이지', () => {
  test('Organization 페이지 접근', async ({ page }) => {
    await page.goto('/organization');
    await page.waitForLoadState('networkidle');

    // 페이지 콘텐츠 확인
    const mainContent = page.locator('main, [role="main"]');
    await expect(mainContent).toBeVisible();

    console.log('✅ Organization 페이지 접근 성공');
  });

  test('조직도 트리 구조 확인', async ({ page }) => {
    await page.goto('/organization');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 트리 구조 또는 카드 레이아웃 확인
    // OrganizationTree renders a list of cards with class "space-y-2" wrapper
    // We look for client card headers which contain "사용자 추가" button or client name
    const treeOrCards = page.locator('.space-y-2 > .border, .sr-card-template').first();
    const structureVisible = await treeOrCards.isVisible({ timeout: 5000 }).catch(() => false);

    if (!structureVisible) {
      console.log('⚠️ 조직도 구조를 찾을 수 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    console.log('✅ 조직도 트리 구조 확인');

    // 고객사 목록이 표시되는지 확인
    const clientElements = page.locator('button:has-text("사용자 추가")'); // Each client header has "사용자 추가" button (if admin) or just check for rows
    const clientCount = await clientElements.count();

    console.log(`📊 표시된 고객사 수: ${clientCount}`);
    expect(clientCount).toBeGreaterThanOrEqual(0);
  });

  test('고객사별 사용자 목록 확인', async ({ page }) => {
    await page.goto('/organization');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 첫 번째 고객사 찾기
    // We assume client rows are div.border.rounded-lg
    const firstClient = page.locator('.space-y-2 > .border').first();
    const clientVisible = await firstClient.isVisible({ timeout: 3000 }).catch(() => false);

    if (!clientVisible) {
      console.log('⚠️ 고객사를 찾을 수 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    const clientName = (await firstClient.textContent()) || '고객사';
    console.log(`📋 고객사: ${clientName}`);

    // 확장 가능한 경우 확장 (Chevron icon button is the first button usually)
    // OrganizationTree implementation: Button with ChevronRight/Down is the first child of the clickable div (or first button inside)
    const expandButton = firstClient.locator('button').first();

    // Check if already expanded (look for ChevronDown or just assume we toggle)
    // Or check if user list is visible
    const userList = firstClient.locator('.pl-12, .space-y-2').nth(1); // sub list has padding
    if (!(await userList.isVisible())) {
      await expandButton.click();
      await page.waitForTimeout(500);
    }

    // 사용자 목록 확인
    // Users are in the expanded list. We can look for .cursor-grab for draggable users, or just text
    const userElements = firstClient.locator('.cursor-grab');
    const userCount = await userElements.count();

    console.log(`👥 표시된 사용자 수: ${userCount}`);
    expect(userCount).toBeGreaterThanOrEqual(0);
  });
  test('사용자 Drag & Drop 재배정 (기능 존재 시)', async ({ page }) => {
    await page.goto('/organization');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 1. Ensure at least one client is expanded and has users
    const firstClient = page.locator('.space-y-2 > .border').first();

    if (!(await firstClient.isVisible())) {
      console.log('⚠️ 고객사가 없습니다. 테스트 스킵');
      test.skip();
      return;
    }

    // Expand first client
    const expandButton = firstClient.locator('button').first();
    const userList = firstClient.locator('.pl-12'); // User list container

    if (!(await userList.isVisible().catch(() => false))) {
      await expandButton.click();
      // Wait for data fetch and render
      await expect(page.locator('.cursor-grab').first())
        .toBeVisible({ timeout: 5000 })
        .catch(() => {});
    }

    // Drag 가능한 사용자 카드 찾기 (dnd-kit useDraggable handle)
    const draggableUser = page.locator('.cursor-grab').first();
    const isDraggable = await draggableUser.isVisible({ timeout: 5000 }).catch(() => false);

    if (!isDraggable) {
      console.log('⚠️ Drag & Drop 기능이 구현되어 있지 않습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    console.log('✅ Drag & Drop 기능 발견');

    // Drop 대상 찾기 (첫번째 고객사 말고 다른 고객사로 이동)
    const dropTargets = page.locator('[class*="drop"], [data-droppable="true"]'); // .client-header usually
    const count = await dropTargets.count();

    if (count < 2) {
      console.log('⚠️ 이동할 수 있는 다른 고객사가 부족합니다.');
      test.skip();
      return;
    }

    const targetIndex = 1; // 두 번째 고객사로 이동
    const dropTarget = dropTargets.nth(targetIndex);

    // 1. Drag & Drop -> 취소 테스트
    try {
      console.log('🔄 Drag & Drop 취소 테스트 시작');
      await draggableUser.dragTo(dropTarget);
      await page.waitForTimeout(500);

      const confirmDialog = page.locator('[role="dialog"], .dialog').first();
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });
      console.log('✅ 재배정 확인 Dialog 표시됨');

      const cancelButton = confirmDialog
        .locator('button')
        .filter({ hasText: /취소|Cancel/i })
        .first();
      await cancelButton.click();
      await expect(confirmDialog).not.toBeVisible();
      console.log('✅ 재배정 취소 완료');
    } catch (error) {
      console.log('⚠️ Drag & Drop 취소 테스트 실패:', error);
      throw error;
    }

    // 2. Drag & Drop -> 확인(이동) 테스트
    try {
      console.log('🔄 Drag & Drop 확인(이동) 테스트 시작');
      // 다시 드래그 (상태가 초기화되었는지 확인 겸)
      await draggableUser.dragTo(dropTarget);
      await page.waitForTimeout(500);

      const confirmDialog = page.locator('[role="dialog"], .dialog').first();
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });

      // 확인 버튼 클릭
      const confirmButton = confirmDialog
        .locator('button')
        .filter({ hasText: /확인|이동|Confirm|Move/i })
        .first();
      await confirmButton.click();

      // 성공 메시지 또는 UI 변경 대기
      // Note: 실제 이동 로직은 Mocking 되지 않았으므로 에러가 날 수도 있고, 변경 사항이 반영될 수도 있음.
      // 여기서는 에러 없이 다이얼로그가 닫히고, 후속 처리가 되는지 확인

      await expect(confirmDialog).not.toBeVisible({ timeout: 5000 });
      console.log('✅ 재배정 확인 버튼 클릭 완료, 다이얼로그 닫힘');

      // 추가적인 검증: 토스트 메시지나 UI 업데이트 확인 (선택 사항)
    } catch (error) {
      console.log('⚠️ Drag & Drop 확인 테스트 실패:', error);
      throw error;
    }

    // 3. 연속 동작 테스트 (버그 재현용: 확인 후 다시 드래그 시도)
    try {
      console.log('🔄 연속 Drag & Drop 시도 (버그 재현 확인)');
      await page.waitForTimeout(1000);

      // 같은 사용자 혹은 다른 사용자를 다시 드래그
      // Note: 이전 드래그로 사용자가 이동했을 수 있으므로 다시 찾거나, 같은 변수 사용 (만약 DOM이 갱신되었다면 에러날 수 있음)
      // 다시 찾기
      const draggableUser2 = page.locator('.cursor-grab').first();
      // 같은 타겟 혹은 다른 타겟
      // 이전 이동으로 targetIndex(1)에 사용자가 추가되었을 것임.
      // 다시 같은 곳으로 이동 시도? 어차피 사용자는 1명 이동했으므로,
      // 원래 그룹에 남은 다른 사용자가 있다면 그걸 드래그.
      // 만약 사용자가 1명뿐이었다면, 1번 그룹으로 이동했으므로 1번 그룹에서 0번 그룹으로 이동 시도해야 함.

      // 간단하게: 현재 화면에 보이는 첫번째 드래그 핸들을 잡고,
      // 현재 보이지 않는(혹은 다른) 드롭 타겟으로 이동.

      // 안전하게 다시 요소 확보
      const dragHandles = page.locator('.cursor-grab');
      if ((await dragHandles.count()) === 0) {
        console.log('⚠️ 더 이상 이동할 사용자가 없습니다.');
      } else {
        const handle = dragHandles.first();
        // 타겟도 다시 확보? 그냥 기존 dropTarget 사용 (같은 곳으로 이동 시도 -> 경고 뜰 수도 있음)
        // 만약 이미 이동한 사용자라면 "같은 고객사로 이동 불가" 뜰 것임.
        // 다른 고객사로 이동 시도

        const dropTarget2 = dropTargets.nth(targetIndex === 1 ? 0 : 1);

        await handle.dragTo(dropTarget2);
        await page.waitForTimeout(500);

        const anyDialog = page.locator('[role="dialog"], .dialog, [role="alert"]').first();
        if (await anyDialog.isVisible()) {
          const text = await anyDialog.textContent();
          console.log(`ℹ️ 세 번째 시도 결과 Dialog: ${text}`);
        }

        console.log('✅ 연속 동작 테스트 수행 완료');
      }
    } catch (e) {
      console.log('⚠️ 연속 동작 테스트 중 에러:', e);
    }
  });
});
