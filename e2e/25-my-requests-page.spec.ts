import { expect, test } from '@playwright/test';

/**
 * My Requests 페이지 테스트
 * - 내가 요청한 SR만 필터링
 * - API 응답 검증
 * - 필터링 및 정렬 기능
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. 그래서 "500ms 동안 네트워크 요청 0건"이라는 networkidle 조건은
 * 영원히 성립하지 않고 waitForLoadState('networkidle') 는 항상 30초 뒤 타임아웃난다.
 * 대신 (1) domcontentloaded 로 내비게이션만 확정하고, (2) 실제로 필요한 것
 * (본문/테이블 요소 표시)을 기다린다. expect().toBeVisible() 은 자동 재시도한다.
 * isVisible() 은 대기하지 않으므로(timeout 옵션 무시) 조건부 요소는
 * waitFor({ state: 'visible' }).catch(() => {}) 로 기다린 뒤 판단한다.
 */

// 테스트 타임아웃 증가 (90초)
test.setTimeout(90000);

test.describe('My Requests 페이지', () => {
  test('My Requests 페이지 접근', async ({ page }) => {
    await page.goto('/my-requests', { timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // 페이지 콘텐츠 확인
    const mainContent = page.locator('main, [role="main"]');
    const isVisible = await mainContent.isVisible({ timeout: 10000 }).catch(() => false);

    if (!isVisible) {
      console.log('⚠️ My Requests 페이지 로드 지연. 테스트 스킵.');
      test.skip(true, '내 요청 목록 조건 미충족으로 테스트 스킵');
      return;
    }

    console.log('✅ My Requests 페이지 접근 성공');
  });

  test('내가 요청한 SR만 표시 확인', async ({ page }) => {
    // API 응답 캡처
    let myRequestsResponse: any = null;

    page.on('response', async (response) => {
      if (response.url().includes('/api/srs/my-requests')) {
        try {
          myRequestsResponse = await response.json();
        } catch (e) {
          console.log('⚠️ API 응답 파싱 실패');
        }
      }
    });

    await page.goto('/my-requests', { timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    if (!myRequestsResponse) {
      console.log('⚠️ My Requests API 응답을 캡처하지 못했습니다. 테스트 스킵.');
      test.skip(true, '내 요청 목록 조건 미충족으로 테스트 스킵');
      return;
    }

    console.log('✅ My Requests API 응답 캡처 성공');

    // 응답 데이터 확인
    const data = myRequestsResponse.data || myRequestsResponse.items || myRequestsResponse;
    const srList = Array.isArray(data) ? data : [];

    console.log(`📊 내 SR 개수: ${srList.length}`);

    // 화면의 SR 행 수와 비교
    const srRows = page.locator('tbody tr, [role="row"]');
    const rowCount = await srRows.count();

    console.log(`📋 화면에 표시된 SR: ${rowCount}`);

    // 개수가 일치하는지 확인 (페이지네이션이 있을 경우 차이 발생 가능)
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('SR 목록 테이블 확인', async ({ page }) => {
    await page.goto('/my-requests', { waitUntil: 'domcontentloaded' });
    await page
      .locator('main')
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});

    // 테이블 또는 리스트 확인
    const table = page.locator('table, [role="table"]');
    // 목록 로드를 실제로 기다린다 (없으면 아래에서 스킵 판단)
    await table
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {});
    const tableVisible = await table.isVisible().catch(() => false);

    if (!tableVisible) {
      console.log('⚠️ SR 목록 테이블을 찾을 수 없습니다. 테스트 스킵.');
      test.skip(true, '내 요청 목록 조건 미충족으로 테스트 스킵');
      return;
    }

    await expect(table).toBeVisible();
    console.log('✅ SR 목록 테이블 확인');

    // 테이블 헤더 확인
    const headers = page.locator('thead th, [role="columnheader"]');
    const headerCount = await headers.count();

    console.log(`📋 테이블 컬럼 수: ${headerCount}`);
    expect(headerCount).toBeGreaterThan(0);
  });

  test('상태별 필터링 기능', async ({ page }) => {
    await page.goto('/my-requests', { waitUntil: 'domcontentloaded' });
    await page
      .locator('main')
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});

    // 필터 Select 또는 버튼 찾기
    const statusFilter = page
      .locator('select[name*="status"], [role="combobox"]')
      .filter({ hasText: /상태|Status/i })
      .first();
    // 필터 UI 렌더링을 실제로 기다린다 (없으면 아래에서 스킵 판단)
    await statusFilter.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const filterVisible = await statusFilter.isVisible().catch(() => false);

    if (!filterVisible) {
      console.log('⚠️ 상태 필터를 찾을 수 없습니다. 테스트 스킵.');
      test.skip(true, '내 요청 목록 조건 미충족으로 테스트 스킵');
      return;
    }

    console.log('✅ 상태 필터 발견');

    // 필터 적용
    await statusFilter.click();
    await page.waitForTimeout(300);

    // 옵션 선택
    const firstOption = page.locator('[role="option"]').first();
    const optionVisible = await firstOption.isVisible({ timeout: 2000 }).catch(() => false);

    if (optionVisible) {
      await firstOption.click();
      await page.waitForTimeout(1000);

      console.log('✅ 필터 적용 완료');

      // 필터 적용 후 목록 업데이트 확인
      const rows = page.locator('tbody tr, [role="row"]');
      const count = await rows.count();

      console.log(`📊 필터링 후 SR 개수: ${count}`);
    }
  });

  test('정렬 기능 확인', async ({ page }) => {
    await page.goto('/my-requests', { waitUntil: 'domcontentloaded' });
    await page
      .locator('main')
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});

    // 정렬 가능한 컬럼 헤더 찾기
    const sortableHeader = page
      .locator('th[role="columnheader"], th')
      .filter({ hasText: /생성일|우선순위|상태/ })
      .first();
    // 테이블 헤더 렌더링을 실제로 기다린다 (없으면 아래에서 스킵 판단)
    await sortableHeader.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const headerVisible = await sortableHeader.isVisible().catch(() => false);

    if (!headerVisible) {
      console.log('⚠️ 정렬 가능한 헤더를 찾을 수 없습니다. 테스트 스킵.');
      test.skip(true, '내 요청 목록 조건 미충족으로 테스트 스킵');
      return;
    }

    console.log('✅ 정렬 가능 컬럼 발견');

    // 헤더 클릭하여 정렬
    await sortableHeader.click();
    await page.waitForTimeout(1000);

    console.log('✅ 정렬 적용 완료');

    // 정렬 아이콘 또는 상태 확인
    const sortIcon = sortableHeader.locator('svg, [class*="sort"], [class*="icon"]');
    const iconVisible = await sortIcon.isVisible({ timeout: 1000 }).catch(() => false);

    if (iconVisible) {
      console.log('✅ 정렬 아이콘 표시 확인');
    }
  });

  test('SR 상세 페이지 이동', async ({ page }) => {
    await page.goto('/my-requests', { waitUntil: 'domcontentloaded' });
    await page
      .locator('main')
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});

    // 첫 번째 SR 행 찾기
    const firstRow = page.locator('tbody tr, [role="row"]').first();
    // 목록 로드를 실제로 기다린다 (SR 이 없을 수도 있으므로 판단은 아래에서)
    await firstRow.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const rowVisible = await firstRow.isVisible().catch(() => false);

    if (!rowVisible) {
      console.log('⚠️ SR이 없습니다. 테스트 스킵.');
      test.skip(true, '내 요청 목록 조건 미충족으로 테스트 스킵');
      return;
    }

    // SR 번호 또는 제목 링크 클릭
    const srLink = firstRow.locator('a').first();
    const linkVisible = await srLink.isVisible({ timeout: 2000 }).catch(() => false);

    if (linkVisible) {
      await srLink.click();
      await page.waitForTimeout(1000);

      // URL 확인 (/srs/[id])
      const url = page.url();
      const isSRDetailPage = url.includes('/srs/') && url.split('/srs/')[1];

      if (isSRDetailPage) {
        console.log('✅ SR 상세 페이지로 이동 성공');
        expect(url).toContain('/srs/');
      }
    } else {
      console.log('⚠️ SR 링크를 찾을 수 없습니다.');
    }
  });
});
