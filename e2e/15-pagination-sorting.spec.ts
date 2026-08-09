import { expect, test } from '@playwright/test';

/**
 * SR 목록의 정렬과 페이지네이션 — **결과가 실제로 바뀌는가**.
 *
 * 예전 5개 테스트는 아무것도 지키지 못했다.
 *  - 'SR 목록 테이블 헤더 및 정렬' — 첫 헤더를 클릭하고 500ms 기다린 뒤 로그만 남겼다.
 *    정렬이 전혀 일어나지 않아도 통과했다.
 *  - '페이지네이션 컨트롤 확인' / '페이지 크기 변경' — 못 찾으면 로그만 남기고 통과.
 *  - '사용자 목록 테이블 확인' / '고객사 목록 테이블 확인' — 목록이 열리는지만 봤다.
 *    그건 00-smoke.spec.ts 로 옮겼다.
 *
 * 정렬 상태는 URL(`?sort=<필드>.<방향>`)과 `aria-sort` 양쪽에 드러난다
 * (src/components/srs/SRsDataTable.tsx 의 handleSort). 둘 다 확인하고,
 * 거기서 멈추지 않고 **행의 실제 순서**까지 대조한다 — URL 만 바뀌고 목록은 그대로인
 * 회귀가 가장 흔하기 때문이다.
 *
 * ⚠️ networkidle 금지 — 인증된 페이지는 /api/realtime SSE 를 계속 열어 둔다.
 */

/** 목록 테이블이 스켈레톤을 걷고 실제로 그려질 때까지 기다린다. */
async function expectListRendered(page: import('@playwright/test').Page) {
  await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({ timeout: 20000 });
}

/** 화면에 보이는 SR 번호를 위에서 아래 순서대로 읽는다. */
async function visibleSrNumbers(page: import('@playwright/test').Page): Promise<string[]> {
  const cells = page.locator('tbody tr td:first-child');
  const texts = await cells.allInnerTexts();
  return texts.map((t) => t.trim()).filter((t) => t.length > 0);
}

test.describe('SR 목록 정렬', () => {
  test('SR 번호 헤더를 누르면 URL·aria-sort·행 순서가 함께 바뀐다', async ({ page }) => {
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expectListRendered(page);

    const header = page.getByRole('columnheader').filter({ hasText: 'SR 번호' });
    await expect(header).toHaveAttribute('aria-sort', 'none');

    // ── 오름차순 ──────────────────────────────────────────────────────────
    await header.getByRole('button', { name: /SR 번호/ }).click();
    await expect(page).toHaveURL(/sort=srNumber\.asc/, { timeout: 15000 });
    await expect(header).toHaveAttribute('aria-sort', 'ascending', { timeout: 15000 });
    await expectListRendered(page);

    const ascending = await visibleSrNumbers(page);
    expect(ascending.length, '정렬을 확인하려면 SR 이 최소 2건 있어야 한다').toBeGreaterThan(1);
    expect(ascending, 'aria-sort 는 ascending 인데 행 순서가 오름차순이 아니다').toEqual(
      [...ascending].sort((a, b) => a.localeCompare(b))
    );

    // ── 같은 헤더를 다시 누르면 내림차순 ────────────────────────────────
    await header.getByRole('button', { name: /SR 번호/ }).click();
    await expect(page).toHaveURL(/sort=srNumber\.desc/, { timeout: 15000 });
    await expect(header).toHaveAttribute('aria-sort', 'descending', { timeout: 15000 });
    await expectListRendered(page);

    const descending = await visibleSrNumbers(page);
    expect(descending, '내림차순 전환 후에도 순서가 그대로다').toEqual([...ascending].reverse());
  });

  test('URL 의 sort 파라미터만으로도 정렬 상태가 복원된다', async ({ page }) => {
    // 정렬 상태가 URL 에 있다는 것은 "링크로 공유 가능하다" 는 계약이다.
    // 클릭 경로만 검증하면 이 계약이 깨져도 모른다.
    await page.goto('/srs?sort=title.asc', { waitUntil: 'domcontentloaded' });
    await expectListRendered(page);

    const titleHeader = page.getByRole('columnheader').filter({ hasText: '제목' });
    await expect(titleHeader).toHaveAttribute('aria-sort', 'ascending', { timeout: 15000 });

    const titles = (await page.locator('tbody tr td:nth-child(2)').allInnerTexts()).map((t) =>
      t.trim()
    );
    expect(titles.length).toBeGreaterThan(1);
    expect(titles, 'sort=title.asc 인데 제목이 오름차순이 아니다').toEqual(
      [...titles].sort((a, b) => a.localeCompare(b))
    );
  });
});

test.describe('SR 목록 페이지네이션', () => {
  test('페이지당 항목 수를 바꾸면 URL 과 표시 행 수가 함께 따라온다', async ({ page }) => {
    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expectListRendered(page);

    const perPage = page.getByRole('combobox', { name: '페이지당 항목 수' });
    await expect(perPage).toBeVisible({ timeout: 15000 });

    await perPage.click();
    await page.getByRole('option', { name: '10', exact: true }).click();

    await expect(page).toHaveURL(/itemsPerPage=10/, { timeout: 15000 });
    await expectListRendered(page);

    const rows = await page.locator('tbody tr').count();
    expect(rows, '페이지당 10건으로 바꿨는데 그보다 많은 행이 보인다').toBeLessThanOrEqual(10);
  });

  test('페이지네이션 컨트롤은 총 페이지가 2 이상일 때만 나타난다', async ({ page }) => {
    // "컨트롤이 없으면 통과" 로 두면 페이지네이션이 통째로 사라져도 모른다.
    // API 의 meta 로 기대치를 정한 뒤 그것과 화면을 대조한다.
    const apiResponse = await page.request.get('/api/srs?pageSize=10&page=1');
    expect(apiResponse.status(), 'GET /api/srs').toBe(200);
    const body = (await apiResponse.json()) as { meta?: { totalPages?: number } };
    const totalPages = body.meta?.totalPages ?? 1;

    await page.goto('/srs?itemsPerPage=10', { waitUntil: 'domcontentloaded' });
    await expectListRendered(page);

    // shadcn 기본값('pagination')이 아니라 이 저장소가 지정한 한국어 라벨이다
    // (src/components/ui/pagination.tsx:10 aria-label="페이지 탐색").
    const pagination = page.getByRole('navigation', { name: '페이지 탐색' });

    if (totalPages > 1) {
      await expect(pagination, `총 ${totalPages}페이지인데 컨트롤이 없다`).toBeVisible({
        timeout: 15000,
      });
      await expect(pagination).toContainText(`1 / ${totalPages}`);
    } else {
      await expect(
        pagination,
        `총 ${totalPages}페이지인데 컨트롤이 보인다 — 한 페이지짜리 목록에 필요 없다`
      ).toHaveCount(0);
    }
  });
});
