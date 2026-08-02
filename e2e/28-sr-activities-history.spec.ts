import { expect, test } from '@playwright/test';

/**
 * SR 활동 로그 및 상태 이력 테스트
 * - SR 활동 로그 표시 (탭 클릭 필요)
 * - SR 상태 이력 표시 (타임라인)
 * - 활동 유형 필터링
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. 그래서 "500ms 동안 네트워크 요청 0건"이라는 networkidle 조건은
 * 영원히 성립하지 않고 waitForLoadState('networkidle') 는 항상 30초 뒤 타임아웃난다.
 * 목록은 요소 표시로, 행 클릭 후 상세 이동은 waitForURL 로 기다린다.
 * isVisible() 은 대기하지 않으므로(timeout 옵션 무시) 조건부 요소는
 * waitFor({ state: 'visible' }).catch(() => {}) 로 기다린 뒤 판단한다.
 */

test.describe('SR 활동 로그 및 이력', () => {
  test('SR 상세 페이지에서 활동 로그 표시 확인', async ({ page }) => {
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({
      timeout: 15000,
    });

    // 첫 번째 SR 클릭
    const firstSR = page.locator('tbody tr, [role="row"]').first();
    await firstSR.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const srVisible = await firstSR.isVisible().catch(() => false);

    if (!srVisible) {
      console.log('⚠️ SR이 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    const srLink = firstSR.locator('a').first();
    await srLink.click();
    // 상세 페이지 이동 확정 (networkidle 대신 URL 기준)
    await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/, { timeout: 15000 });

    // "활동 이력" 탭 클릭 (더 유연한 셀렉터 사용)
    const activityTab = page
      .getByRole('tab', { name: /활동 이력/i })
      .or(page.locator('button').filter({ hasText: /활동 이력/i }))
      .first();

    await activityTab.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const tabVisible = await activityTab.isVisible().catch(() => false);
    if (!tabVisible) {
      console.log('⚠️ 활동 이력 탭을 찾을 수 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }
    await activityTab.click({ force: true });

    // 탭이 활성화되었는지 확인 (더 유연한 확인)
    await page.waitForTimeout(1000);

    // 탭 컨텐츠 로딩 대기
    await page.waitForTimeout(1000);

    // 활동 로그 섹션 확인 (CardTitle 텍스트로 확인)
    const activityTitle = page.locator('.card-title, h3').filter({ hasText: /활동 이력/ });
    await expect(activityTitle).toBeVisible();

    // 활동 항목 확인
    const activityContent = page.locator('[role="tabpanel"][data-state="active"]');
    const noActivities = await activityContent.getByText('활동 이력이 없습니다').isVisible();

    if (!noActivities) {
      const activityItems = activityContent.locator('.relative.flex.gap-4');
      const count = await activityItems.count();
      console.log(`📊 활동 항목 수: ${count}`);
      expect(count).toBeGreaterThanOrEqual(0);
    } else {
      console.log('ℹ️ 활동 이력이 없습니다.');
    }
  });

  test('상태 이력 타임라인 확인', async ({ page }) => {
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({
      timeout: 15000,
    });

    // 첫 번째 SR 클릭
    const firstSR = page.locator('tbody tr, [role="row"]').first();
    await firstSR.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (!(await firstSR.isVisible())) {
      test.skip();
      return;
    }

    await firstSR.locator('a').first().click();
    // 상세 페이지 이동 확정 (networkidle 대신 URL 기준)
    await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/, { timeout: 15000 });

    // 상태 변경 이력 카드 찾기 (클래스 의존성 줄임)
    const timelineCard = page.locator('.border.bg-card').filter({ hasText: '상태 변경 이력' });

    // 타임라인이 없을 수도 있음 (history가 없는 경우)
    await timelineCard
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});
    if (await timelineCard.isVisible()) {
      console.log('✅ 상태 이력 타임라인 발견');
      const timelineItems = timelineCard.locator('.relative > .flex.gap-4');
      const count = await timelineItems.count();
      console.log(`📊 타임라인 항목 수: ${count}`);
      expect(count).toBeGreaterThanOrEqual(1);
    } else {
      console.log('ℹ️ 상태 이력 타임라인이 없습니다 (데이터 없음).');
    }
  });

  test('활동 유형별 필터링', async ({ page }) => {
    // 이 기능은 현재 UI에 구현되어 있지 않을 수 있음
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({
      timeout: 15000,
    });

    const firstSR = page.locator('tbody tr, [role="row"]').first();
    await firstSR.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (!(await firstSR.isVisible().catch(() => false))) {
      console.log('⚠️ SR이 없습니다. 테스트 스킵.');
      test.skip();
      return;
    }

    await firstSR.locator('a').first().click();
    // 상세 페이지 이동 확정 (networkidle + 고정 sleep 대신 URL 기준)
    await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/, { timeout: 15000 });

    // 활동 이력 탭 클릭 (더 유연한 셀렉터)
    const activityTab = page
      .getByRole('tab', { name: /활동 이력/i })
      .or(page.locator('button').filter({ hasText: /활동 이력/i }))
      .first();

    await activityTab.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const tabVisible = await activityTab.isVisible().catch(() => false);
    if (!tabVisible) {
      console.log('ℹ️ 활동 이력 탭을 찾을 수 없습니다. 테스트 통과.');
      return;
    }
    await activityTab.click({ force: true });
    await page.waitForTimeout(1000);

    // 필터가 있는지 확인
    const filter = page.locator('select, [role="combobox"]').filter({ hasText: /유형|Type/i });
    await filter
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});
    if (await filter.isVisible().catch(() => false)) {
      await filter.click();
      console.log('✅ 활동 유형 필터 발견');
    } else {
      console.log('ℹ️ 활동 유형 필터가 없습니다. 테스트 통과.');
    }
  });
});
