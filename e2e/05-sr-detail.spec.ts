import { type Browser, expect, type Page, test } from '@playwright/test';

import { deleteSeededSRs, type SeededSR, seedSR } from './fixtures/sr';

/**
 * SR 상세 페이지 — 탭 구조와 댓글 작성.
 *
 * ── 이 파일의 내력 ───────────────────────────────────────────────────────
 * 예전의 이 스펙은 탭도 댓글도 전부 "찾으면 하고, 못 찾으면 로그" 였다.
 * '탭 네비게이션' 테스트는 **단언이 하나도 없었고**(탭 리스트가 없으면 else 로
 * 빠져 "단일 뷰 레이아웃일 수 있음" 을 찍고 끝), '코멘트 추가' 는 입력란이나
 * 제출 버튼을 못 찾으면 그대로 통과했다. 탭이 통째로 사라져도, 댓글 작성이
 * 아예 없어져도 두 테스트 모두 초록불이었다.
 *
 * ── 무엇을 계약으로 삼는가 ────────────────────────────────────────────────
 * 탭은 3개(댓글 · 활동 이력 · 첨부파일)이고 각 탭패널의 내용이 정해져 있다
 * (src/app/(dashboard)/srs/[id]/page.tsx 의 TabsList). 개수를 세는 대신
 * **이름으로** 찍어 확인하고, 클릭 후 그 패널의 고유한 내용까지 확인한다.
 * 댓글은 서버 상태(GET /api/srs/{id}/comments)로 확정한다 — 화면에 보이는 것만
 * 확인하면 낙관적 렌더와 구분되지 않는다.
 *
 * ⚠️ networkidle 금지 — 로그인 상태에서는 /api/realtime SSE 가 계속 열려 있어
 * "500ms 동안 요청 0건" 이 영원히 성립하지 않는다.
 */

/** 댓글 목록 응답에서 이 스펙이 쓰는 필드. */
interface CommentRow {
  id: string;
  content: string;
}

const seededSRIds: string[] = [];

async function seed(browser: Browser): Promise<SeededSR> {
  const sr = await seedSR(browser, { stage: 'INTAKE', title: `상세 페이지 SR ${Date.now()}` });
  seededSRIds.push(sr.id);
  return sr;
}

test.afterAll(async ({ browser }) => {
  await deleteSeededSRs(browser, seededSRIds);
});

async function openDetail(page: Page, sr: SeededSR): Promise<void> {
  await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
  // 엉뚱한 SR 을 보고 있지 않은지부터 확정한다.
  await expect(page.getByTestId('sr-title')).toHaveText(sr.title);
}

/** 활성 탭패널. 같은 문구의 TabsTrigger 와 충돌하지 않도록 스코프한다. */
function activePanel(page: Page) {
  return page.locator('[role="tabpanel"][data-state="active"]');
}

test.describe('SR 상세 페이지', () => {
  test('상세 정보가 시드한 값 그대로 보인다', async ({ browser, page }) => {
    const sr = await seed(browser);
    await openDetail(page, sr);

    // 예전에는 "상세 정보" 라는 **제목**만 보이면 통과였다. 제목이 있는 것과
    // 내용이 맞는 것은 다르다 — SR 번호와 상태까지 확인한다.
    // (SR 번호는 h1 과 CopyButton 의 value 로 두 번 나오므로 h1 을 겨냥한다.)
    await expect(page.getByRole('heading', { name: sr.srNumber, level: 1 })).toBeVisible();
    await expect(page.getByText('접수', { exact: true }).first()).toBeVisible();
  });

  test('탭 3개가 이름대로 있고, 각 탭패널이 자기 내용을 보여준다', async ({ browser, page }) => {
    const sr = await seed(browser);
    await openDetail(page, sr);

    const tablist = page.getByRole('tablist');
    await expect(tablist).toBeVisible();

    // 개수만 세면(예전 방식) 탭 하나가 다른 것으로 바뀌어도 통과한다. 이름으로 찍는다.
    await expect(tablist.getByRole('tab')).toHaveCount(3);
    for (const name of [/댓글/, /활동 이력/, /첨부파일/]) {
      await expect(tablist.getByRole('tab', { name })).toBeVisible();
    }

    // 클릭이 실제로 그 패널을 여는지까지 확인한다. 각 패널의 고유한 문구를 쓴다.
    await page.getByRole('tab', { name: /댓글/ }).click();
    await expect(activePanel(page).getByText('새 댓글 작성')).toBeVisible();

    await page.getByRole('tab', { name: /활동 이력/ }).click();
    await expect(activePanel(page).getByText(/^활동 이력 \(\d+\)$/)).toBeVisible();

    await page.getByRole('tab', { name: /첨부파일/ }).click();
    await expect(activePanel(page).getByRole('button', { name: '파일 업로드' })).toBeVisible();
  });

  test('댓글을 남기면 서버에 저장되고 목록 개수가 늘어난다', async ({ browser, page }) => {
    const sr = await seed(browser);
    await openDetail(page, sr);

    await page.getByRole('tab', { name: /댓글/ }).click();
    const panel = activePanel(page);
    await expect(panel.getByText('댓글 (0)')).toBeVisible();

    const content = `E2E 상세 댓글 ${Date.now()}`;
    const posted = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/srs/${sr.id}/comments` &&
        r.request().method() === 'POST'
    );
    await panel.getByRole('textbox', { name: '댓글 작성' }).fill(content);
    await panel.getByRole('button', { name: '댓글 추가' }).click();

    expect((await posted).status(), '댓글 등록이 201 이 아닙니다.').toBe(201);

    // ── 화면 반영 ────────────────────────────────────────────────────────
    await expect(panel.getByText(content)).toBeVisible();
    await expect(panel.getByText('댓글 (1)')).toBeVisible();

    // ── 서버 상태 ────────────────────────────────────────────────────────
    // 화면만 보면 낙관적 렌더에 속을 수 있다. 예전 스펙은 여기까지 가지 않았다.
    const listed = await page.request.get(`/api/srs/${sr.id}/comments`);
    expect(listed.status()).toBe(200);
    const body = (await listed.json()) as { comments: CommentRow[] } | CommentRow[];
    const rows = Array.isArray(body) ? body : body.comments;
    expect(rows.map((r) => r.content)).toContain(content);
  });

  test('빈 댓글은 등록되지 않는다', async ({ browser, page }) => {
    // 음성 대조. 위 테스트가 "무엇을 넣어도 통과" 로 지나가는 것을 막는다.
    const sr = await seed(browser);
    await openDetail(page, sr);

    await page.getByRole('tab', { name: /댓글/ }).click();
    const panel = activePanel(page);

    // 공백만 넣어도 등록되면 안 된다. 버튼이 막히든 서버가 막든, 결과는 0건이어야 한다.
    await panel.getByRole('textbox', { name: '댓글 작성' }).fill('   ');
    await panel.getByRole('button', { name: '댓글 추가' }).click();

    const listed = await page.request.get(`/api/srs/${sr.id}/comments`);
    const body = (await listed.json()) as { comments: CommentRow[] } | CommentRow[];
    const rows = Array.isArray(body) ? body : body.comments;
    expect(rows, '공백만 있는 댓글이 저장되었습니다.').toHaveLength(0);
  });
});
