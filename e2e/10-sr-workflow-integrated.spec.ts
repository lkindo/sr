import { expect, type Page, test } from '@playwright/test';

import { deleteSeededSRs, type SeededSR, seedSR } from './fixtures/sr';
import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';

/**
 * SR 상세 화면의 "연속 액션" 검증.
 *
 * ── 이 파일이 지키는 것 ───────────────────────────────────────────────────
 * 예전의 이 스펙은 SR 생성 → 접수 → 상태 변경 → 댓글을 ADMIN 세션으로 한 번 더 훑었다.
 * 그런데 그 각각은 이미 다른 스펙의 검증 대상이다 — 등록 UI 는 04, 접수 폼은 22,
 * 상태 전이 규칙은 21, 역할 간 협업은 17. 겹치는 만큼 실행 시간만 들고,
 * 정작 상태 변경 부분은 "버튼을 못 찾으면 로그를 남기고 통과" 라 검증이 아니었다.
 *
 * 겹치지 않으면서 이 파일만 지킬 수 있는 것은 하나다:
 * **상세 화면 하나에서 ADMIN 이 댓글과 상태 액션을 연달아 수행할 수 있는가.**
 * 댓글 작성 후에도 상태 버튼이 살아 있는지, 한 번의 전이가 다음 전이의 UI 를
 * 제대로 열어 주는지는 개별 스펙(21 은 API, 17 은 역할별 화면)이 보지 않는 자리다.
 *
 * ── 왜 준비를 API 로 하는가 ───────────────────────────────────────────────
 * 등록 다이얼로그와 접수 폼을 UI 로 통과하는 데만 40초 넘게 들었고 그 전부가
 * arrange 였다. `seedSR({ stage: 'INTAKE' })` 로 대체해 검증 구간만 UI 로 남긴다.
 * 준비가 UI 에서 사라지면서 3개 테스트를 묶던 serial 도 함께 없앴다 —
 * serial 은 1번이 실패하면 나머지가 "실패"가 아니라 "미검증"으로 조용히 사라진다.
 *
 * ── 왜 서버 상태를 따로 확인하는가 ────────────────────────────────────────
 * `useChangeSRStatus`(src/hooks/use-sr.ts) 는 onMutate 에서 낙관적 업데이트를 한다.
 * 즉 화면의 배지/버튼은 **서버 응답 전에** 이미 바뀐다. 화면만 보면 서버가 거부해도
 * 잠깐은 통과하는 창이 생기므로, 전이마다 GET /api/srs/{id} 로 실제 저장된 상태를
 * 함께 단언한다.
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. "500ms 동안 네트워크 요청 0건" 은 영원히 성립하지 않는다.
 */

test.use({ storageState: PERSONA_AUTH_FILES.admin });

/** 서버에 실제로 저장된 상태를 확인한다(낙관적 업데이트에 속지 않기 위해). */
async function expectServerStatus(page: Page, srId: string, expected: string) {
  const response = await page.request.get(`/api/srs/${srId}`);
  expect(response.status(), `GET /api/srs/${srId} 가 실패했습니다.`).toBe(200);
  const body = (await response.json()) as { status: string };
  expect(body.status, `서버에 저장된 SR 상태가 ${expected} 가 아닙니다.`).toBe(expected);
}

/** 이 SR 자신의 경로인지. `/api/srs/{id}/comments` 같은 하위 경로와 구분해야 한다. */
const isPath = (url: string, path: string) => new URL(url).pathname === path;

test.describe('SR 상세 화면 연속 액션 (ADMIN)', () => {
  let sr: SeededSR;

  test.beforeAll(async ({ browser }) => {
    // 접수까지는 검증 대상이 아니다(접수 폼 UI 는 22 가 본다). API 로 끝낸다.
    sr = await seedSR(browser, {
      stage: 'INTAKE',
      title: `상세 연속 액션 SR ${Date.now()}`,
    });
  });

  test.afterAll(async ({ browser }) => {
    await deleteSeededSRs(browser, [sr?.id]);
  });

  test('댓글 작성 후 진행 시작 → 완료 처리를 한 화면에서 연달아 수행한다', async ({ page }) => {
    await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });

    // 상세 데이터는 서버 액션(getSRDetailsAction)으로 오므로 기다릴 XHR 이 없다.
    // 제목이 뜨는 것이 곧 로딩 완료이고, 동시에 엉뚱한 SR 이 아님을 확정한다.
    await expect(page.getByTestId('sr-title')).toHaveText(sr.title);

    // ── 1) 댓글 작성 ──────────────────────────────────────────────────────
    // 본문에 타임스탬프를 넣어 목록에서 이 실행이 만든 댓글만 겨냥한다.
    const commentBody = `연속 액션 검증 댓글 ${Date.now()}`;
    await page.getByRole('textbox', { name: '댓글 작성' }).fill(commentBody);

    const commentCreated = page.waitForResponse(
      (r) => isPath(r.url(), `/api/srs/${sr.id}/comments`) && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: '댓글 추가' }).click();
    expect((await commentCreated).status(), 'POST /comments 가 201 이 아닙니다.').toBe(201);

    // 목록에 반영되는지까지 본다 — 저장만 되고 화면에 안 뜨는 회귀가 실제 결함이다.
    await expect(page.getByRole('listitem').filter({ hasText: commentBody })).toBeVisible();

    // ── 2) 진행 시작 (INTAKE → IN_PROGRESS) ───────────────────────────────
    // 댓글을 쓴 뒤에도 상태 액션이 살아 있어야 한다. 이것이 이 스펙의 고유한 검증점이다.
    const startButton = page.getByRole('button', { name: '진행 시작' });
    await expect(startButton).toBeVisible();

    const started = page.waitForResponse(
      (r) => isPath(r.url(), `/api/srs/${sr.id}/status`) && r.request().method() === 'PATCH'
    );
    await startButton.click();
    expect((await started).status(), 'start 전이가 200 이 아닙니다.').toBe(200);

    await expectServerStatus(page, sr.id, 'IN_PROGRESS');

    // 화면 반영: 진행 시작 버튼은 사라지고 IN_PROGRESS 의 액션 두 개가 나타난다.
    // (SRStatusActions 는 상태별로 버튼 집합을 갈아 끼우므로 버튼 자체가 상태의 증거다.
    //  '진행중' 같은 텍스트 매칭은 활동 이력·타임라인에도 걸려 상태 검증이 되지 않는다.)
    await expect(startButton).toHaveCount(0);
    const completeButton = page.getByRole('button', { name: '완료 처리' });
    await expect(completeButton).toBeVisible();
    await expect(page.getByRole('button', { name: '보류' })).toBeVisible();

    // ── 3) 완료 처리 (IN_PROGRESS → COMPLETED) ────────────────────────────
    await completeButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('SR 완료 처리')).toBeVisible();
    await dialog.getByLabel(/해결 내용/).fill('E2E 연속 액션 검증으로 처리했습니다.');

    const completed = page.waitForResponse(
      (r) => isPath(r.url(), `/api/srs/${sr.id}/status`) && r.request().method() === 'PATCH'
    );
    // 트리거 버튼과 제출 버튼의 이름이 같으므로 반드시 다이얼로그 안에서 찾는다.
    await dialog.getByRole('button', { name: '완료 처리' }).click();
    expect((await completed).status(), 'complete 전이가 200 이 아닙니다.').toBe(200);

    // SRStatusChangeDialog 는 성공 후 목록으로 되돌린다(router.push('/srs')).
    await page.waitForURL(/\/srs$/);
    await expectServerStatus(page, sr.id, 'COMPLETED');

    // ── 4) 완료 후 상세 화면의 액션 집합 ──────────────────────────────────
    await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('sr-title')).toHaveText(sr.title);

    // 완료된 SR 에는 진행 액션이 남아 있으면 안 된다.
    await expect(page.getByRole('button', { name: '완료 처리' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '보류' })).toHaveCount(0);
    // 재오픈은 ADMIN 에게 열려 있고(sr-state-machine 의 COMPLETED → IN_PROGRESS),
    // 확인 완료는 신청자(CLIENT_USER)만 가능하므로 ADMIN 세션에는 없어야 한다.
    await expect(page.getByRole('button', { name: '재오픈' })).toBeVisible();
    await expect(page.getByRole('button', { name: '확인 완료' })).toHaveCount(0);
  });
});
