import { expect, test } from '@playwright/test';

/**
 * 대시보드 — 화면에 그려진 숫자가 API 가 준 숫자와 같은가.
 *
 * 예전 6개 테스트는 전부 무엇도 지키지 못했다.
 *  - '대시보드 페이지 접근' / '통계 요소 화면 표시 확인' — `main` 이나 `[class*="card"]` 만
 *    확인했다. 후자는 Tailwind 유틸리티라 무엇이든 매칭되어 항상 참이었다.
 *  - 'Dashboard API 응답 검증' — 응답을 못 잡으면 `main` 확인으로 통과했고, 잡아도
 *    `expect(statsResponse).toBeDefined()` 가 전부였다.
 *  - '최근 SR 또는 활동 섹션' / '빠른 액션 버튼' — 못 찾으면 로그만 남기고 통과했다.
 * 라우트가 열리는지는 00-smoke.spec.ts 가 본다. 여기서는 **값의 일치**만 본다.
 *
 * ⚠️ networkidle 금지 — 인증된 페이지는 /api/realtime SSE 를 계속 열어 둔다.
 */

interface DashboardStats {
  summary: {
    total: number;
    inProgress: number;
    completed: number;
    pending: number;
    urgent: number;
  };
  byStatus: Record<string, number>;
  recentSRs: Array<{ id: string; srNumber: string; title: string }>;
}

/** 통계 카드 제목 → 그 카드가 보여 줘야 하는 summary 필드 */
const STAT_CARDS = [
  { title: '총 SR', field: 'total' },
  { title: '진행 중', field: 'inProgress' },
  { title: '완료', field: 'completed' },
  { title: '대기 중', field: 'pending' },
] as const;

test.describe('대시보드', () => {
  test('통계 카드의 숫자가 API 응답과 일치한다', async ({ page }) => {
    // 화면과 대조할 기준값을 먼저 API 에서 직접 받는다.
    // (페이지가 부르는 응답을 가로채지 않는 이유: 그러면 "화면이 그 응답을 실제로
    //  반영했는가" 가 아니라 "같은 응답을 두 번 봤다" 가 되어 버린다.)
    const apiResponse = await page.request.get('/api/dashboard/stats');
    expect(apiResponse.status(), 'GET /api/dashboard/stats').toBe(200);
    const stats = (await apiResponse.json()) as DashboardStats;

    expect(stats.summary, '응답에 summary 가 없다').toBeTruthy();
    expect(typeof stats.summary.total, 'summary.total 이 숫자가 아니다').toBe('number');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '대시보드', exact: true })).toBeVisible({
      timeout: 20000,
    });

    for (const { title, field } of STAT_CARDS) {
      // 카드 제목과 숫자는 같은 Card 안에 있다. 제목으로 카드를 특정한 뒤
      // 그 안에서 숫자를 읽어야 다른 카드의 숫자를 잘못 집지 않는다.
      const card = page.locator('.sr-card').filter({ hasText: title }).first();
      await expect(card, `'${title}' 카드가 없다`).toBeVisible({ timeout: 15000 });
      await expect(
        card,
        `'${title}' 카드가 API 값(${stats.summary[field]})과 다른 숫자를 보여 준다`
      ).toContainText(String(stats.summary[field]));
    }
  });

  test('최근 SR 활동 섹션이 API 의 recentSRs 를 그대로 보여 준다', async ({ page }) => {
    const apiResponse = await page.request.get('/api/dashboard/stats');
    expect(apiResponse.status()).toBe(200);
    const stats = (await apiResponse.json()) as DashboardStats;

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    const section = page.locator('.sr-card').filter({ hasText: '최근 SR 활동' }).first();
    await expect(section).toBeVisible({ timeout: 20000 });

    if (stats.recentSRs.length === 0) {
      // 빈 상태도 계약이다 — 문구가 사라지면 사용자는 로딩 실패와 구분할 수 없다.
      await expect(section).toContainText('아직 SR이 없습니다');
      return;
    }

    // 목록이 있으면 각 항목이 상세로 가는 링크를 가져야 한다.
    const links = section.locator('a[href^="/srs/"]');
    await expect(links.first()).toBeVisible({ timeout: 15000 });
    expect(await links.count(), '최근 SR 링크 수가 API 응답보다 적다').toBeGreaterThanOrEqual(
      Math.min(stats.recentSRs.length, 10)
    );

    // 첫 항목의 SR 번호가 실제로 화면에 있어야 한다.
    await expect(section).toContainText(stats.recentSRs[0]!.srNumber);
  });

  test('빠른 접근 카드가 실제로 해당 화면으로 데려간다', async ({ page }) => {
    // 예전 테스트는 '새 SR|생성|등록|요청' 중 아무 버튼이나 찾아 클릭하고, 다이얼로그가
    // 뜨든 페이지가 바뀌든 로그만 남겼다. 대시보드의 빠른 접근은 Link 카드 3개이고
    // 각각 목적지가 정해져 있다(page.tsx 의 Quick Access Cards).
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '대시보드', exact: true })).toBeVisible({
      timeout: 20000,
    });

    const quickLinks = [
      { title: '내 요청 SR', url: /\/my-requests$/ },
      { title: 'SR 전체 목록', url: /\/srs$/ },
    ];

    for (const { title, url } of quickLinks) {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      const card = page.locator('a').filter({ hasText: title }).first();
      await expect(card, `'${title}' 빠른 접근 카드가 없다`).toBeVisible({ timeout: 15000 });
      await card.click();
      await expect(page, `'${title}' 카드가 엉뚱한 곳으로 보낸다`).toHaveURL(url, {
        timeout: 15000,
      });
    }
  });
});
