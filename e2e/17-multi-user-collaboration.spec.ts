import { type Browser, expect, type Page, test } from '@playwright/test';

import { deleteSeededSRs, type SeededSR, seedSR } from './fixtures/sr';
import { PERSONA_AUTH_FILES, type PersonaKey } from './helpers/auth-helpers';
import { changeSRStatus, selectAssignee } from './helpers/test-helpers';

/**
 * 다중 사용자 협업 — 크로스 페르소나 가시성
 *
 * ── 이 파일이 검증하는 것 ────────────────────────────────────────────────
 * "한 SR 을 두고 CLIENT / MANAGER / ENGINEER 가 주고받은 것이 **서로에게 실제로
 * 보이는가**". 이 저장소에서 그것을 확인하는 곳은 여기뿐이다.
 *
 * ── 이 파일이 더 이상 검증하지 않는 것과 그 이유 ─────────────────────────
 * 예전에는 1번 테스트가 SR 등록 다이얼로그를, 2번 테스트가 접수 폼을 UI 로 통과했다.
 * 둘 다 여기서는 arrange 단계이고, 그 UI 자체는 04-sr-create / 22-sr-intake-process 가
 * 각각 한 번씩 검증한다. 지금은 `seedSR()` 로 API 준비만 하고(수십 초 → 수 초),
 * 남은 시간과 단언을 전부 "상대 화면에 보이는가"에 쓴다.
 *
 * 또 예전에는 3~7번이 전부 "댓글 입력란을 못 찾으면 로그 남기고 통과" 였다.
 * 즉 협업 시나리오 후반 다섯 테스트는 화면이 통째로 비어도 초록불이었다.
 * 지금은 실제 셀렉터(SRComments.tsx 의 aria-label='댓글 작성', 버튼 '댓글 추가')를
 * 읽어서 쓰고, 댓글 등록은 POST /api/srs/{id}/comments 의 201 까지 확인한다.
 *
 * ── serial 을 뗀 이유 ────────────────────────────────────────────────────
 * 각 테스트가 자기 SR 을 API 로 직접 시드하므로 앞 테스트의 산출물에 의존하지 않는다.
 * serial 이면 1번 실패 시 나머지가 skip 되어 "실패 1건"으로만 보이지만 실제로는
 * 전부 미검증이다. 독립 실행이면 실패한 것만 빨갛게 남는다.
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. "500ms 동안 네트워크 요청 0건"은 영원히 성립하지 않는다.
 */

/** MANAGER 역할 검증용이 아니라 "접수/재배정을 할 수 있는 내부 사용자" 로 쓴다. */
const ADMIN_EMAIL = process.env.TEST_USER_EMAIL || 'admin@example.com';

// ============================================================================
// 페르소나·화면 헬퍼
// ============================================================================

/**
 * 페르소나 세션으로 페이지를 열고 끝나면 반드시 컨텍스트를 닫는다.
 *
 * 주의: 'legacyManager' 는 이름과 달리 admin@example.com(ADMIN) 세션이다
 * (helpers/auth-helpers.ts 참고). 진짜 MANAGER 계정은 시드 계약에 아직 없으므로
 * 이 파일에서는 "내부 처리자" 역할로 legacyManager 를 쓴다.
 */
async function withPersona<T>(
  browser: Browser,
  persona: PersonaKey,
  action: (page: Page) => Promise<T>
): Promise<T> {
  const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES[persona] });
  const page = await context.newPage();
  try {
    return await action(page);
  } finally {
    await context.close();
  }
}

/** 현재 세션의 표시 이름. 댓글 작성자 대조에 쓴다(이름을 하드코딩하면 시드가 바뀔 때 조용히 틀어진다). */
async function displayName(page: Page): Promise<string> {
  const response = await page.request.get('/api/auth/session');
  expect(response.status(), '세션 조회에 실패해 작성자 대조가 불가능하다').toBe(200);

  const session = (await response.json()) as { user?: { name?: string } };
  const name = session.user?.name;
  expect(name, '세션에 표시 이름이 없다 — 댓글 작성자 대조가 불가능하다').toBeTruthy();
  return name!;
}

/** SR 상세를 열고 **그 SR 이 맞는지**까지 확정한다. 여기서 실패하면 권한/라우팅 문제다. */
async function openSR(page: Page, sr: SeededSR): Promise<void> {
  await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await expect(
    page.getByTestId('sr-title'),
    `${sr.srNumber} 상세가 렌더되지 않았다 (권한 거부이거나 조회 실패)`
  ).toHaveText(sr.title, { timeout: 20000 });
}

/**
 * 상세 헤더의 **상태** 배지.
 *
 * `text=/완료|COMPLETED/i` 같은 넓은 매칭은 '완료 처리' 버튼에도 걸려 상태 검증이
 * 무의미해진다. 배지에는 아직 data-testid 가 없으므로, h1(SR 번호)의 부모로 범위를
 * 좁힌 뒤 정확 일치로 고른다. 그 범위 안에는 상태 배지와 우선순위 배지뿐이고
 * 두 라벨 집합은 겹치지 않는다(src/lib/constants/sr.ts).
 */
function statusBadge(page: Page, sr: SeededSR, label: string) {
  return page
    .getByRole('heading', { level: 1, name: sr.srNumber })
    .locator('..')
    .getByText(label, { exact: true });
}

/** 댓글 목록의 항목. 본문에 호출별 고유 스탬프가 섞여 있어야 1건으로 특정된다. */
function commentItem(page: Page, body: string) {
  return page.getByRole('listitem').filter({ hasText: body });
}

/**
 * 댓글을 UI 로 작성한다.
 *
 * 셀렉터는 src/components/srs/SRComments.tsx 의 실제 값이다
 * (Textarea aria-label='댓글 작성', 제출 버튼 라벨 '댓글 추가').
 * 버튼만 눌리고 아무 일도 없었던 경우를 성공으로 오인하지 않도록
 * POST /api/srs/{id}/comments 의 201 을 반드시 확인한다.
 */
async function postComment(page: Page, sr: SeededSR, body: string): Promise<void> {
  const editor = page.getByRole('textbox', { name: '댓글 작성' });
  await expect(editor, '댓글 입력란이 없다').toBeVisible({ timeout: 20000 });
  await editor.fill(body);

  const created = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/srs/${sr.id}/comments`) &&
      response.request().method() === 'POST',
    { timeout: 20000 }
  );
  await page.getByRole('button', { name: '댓글 추가' }).click();

  const response = await created;
  const payload = await response.text().catch(() => '(본문 없음)');
  expect(response.status(), `댓글 등록이 거부되었다. 응답: ${payload.slice(0, 300)}`).toBe(201);

  // 성공 시 SRComments 가 입력을 비운다. 비지 않으면 화면은 실패 상태다.
  await expect(editor).toHaveValue('', { timeout: 10000 });
  await expect(
    commentItem(page, body),
    '작성자 자신의 화면에 새 댓글이 나타나지 않았다'
  ).toHaveCount(1);
}

// ============================================================================
// 시나리오
// ============================================================================

test.describe('다중 사용자 협업 — 크로스 페르소나 가시성', () => {
  // 한 테스트가 페르소나 3명분의 컨텍스트를 순차로 여닫으므로 기본 타임아웃으로는 모자란다.
  test.setTimeout(120000);

  /** 각 테스트가 자기 SR 을 시드한다. 시드 데이터(TEST001 등)는 건드리지 않는다. */
  const seededIds: string[] = [];

  test.afterAll(async ({ browser }) => {
    await deleteSeededSRs(browser, seededIds);
  });

  test('ENGINEER 의 댓글과 CLIENT 의 회신이 서로의 화면에 보인다', async ({ browser }) => {
    const stamp = `${Date.now()}`;
    const sr = await seedSR(browser, {
      stage: 'IN_PROGRESS',
      title: `협업 댓글 왕복 ${stamp}`,
    });
    seededIds.push(sr.id);

    const engineerNote = `엔지니어 진행 메모 ${stamp}`;
    const clientReply = `고객 회신 ${stamp}`;

    // ── ENGINEER 가 댓글을 남긴다 ────────────────────────────────────────
    const engineerName = await withPersona(browser, 'engineer', async (page) => {
      await openSR(page, sr);
      await postComment(page, sr, engineerNote);
      return displayName(page);
    });

    // ── CLIENT 화면에 그 댓글이 작성자 이름과 함께 보인다 ────────────────
    const clientName = await withPersona(browser, 'client', async (page) => {
      await openSR(page, sr);

      const fromEngineer = commentItem(page, engineerNote);
      await expect(fromEngineer, 'ENGINEER 가 남긴 댓글이 CLIENT 화면에 보이지 않는다').toHaveCount(
        1
      );
      // 본문만 보고 끝내면 "누가 썼는지"가 뒤바뀌어도 통과한다.
      await expect(fromEngineer).toContainText(engineerName);

      await postComment(page, sr, clientReply);
      return displayName(page);
    });

    // ── ENGINEER 가 다시 열면 회신이 보이고, 자기 댓글도 그대로 남아 있다 ─
    await withPersona(browser, 'engineer', async (page) => {
      await openSR(page, sr);

      const fromClient = commentItem(page, clientReply);
      await expect(fromClient, 'CLIENT 회신이 ENGINEER 화면에 보이지 않는다').toHaveCount(1);
      await expect(fromClient).toContainText(clientName);

      // 목록이 페르소나별로 갈라지지 않는지(=한쪽 댓글만 보이지 않는지) 함께 확인한다.
      await expect(commentItem(page, engineerNote)).toHaveCount(1);
    });
  });

  test('ENGINEER 의 완료 처리와 CLIENT 의 확인 완료가 서로의 화면에 반영된다', async ({
    browser,
  }) => {
    const stamp = `${Date.now()}`;
    const sr = await seedSR(browser, {
      stage: 'IN_PROGRESS',
      title: `협업 상태 전이 ${stamp}`,
    });
    seededIds.push(sr.id);

    // ENGINEER 가 UI 로 완료 처리한다 (changeSRStatus 가 PATCH 200 까지 단언한다).
    await withPersona(browser, 'engineer', async (page) => {
      await changeSRStatus(page, sr.id, 'complete', {
        resolutionDescription: `엔지니어가 완료 처리했습니다. ${stamp}`,
      });
    });

    // CLIENT 화면에 '완료' 가 반영되고, 신청자에게만 열리는 '확인 완료' 가 나타난다.
    await withPersona(browser, 'client', async (page) => {
      await openSR(page, sr);
      await expect(
        statusBadge(page, sr, '완료'),
        'ENGINEER 의 완료 처리가 CLIENT 화면에 반영되지 않았다'
      ).toBeVisible({ timeout: 20000 });

      // '확인 완료' 는 SRStatusActions.tsx 에서 isRequestor 일 때만 렌더된다.
      await expect(page.getByRole('button', { name: '확인 완료' })).toBeVisible();

      await changeSRStatus(page, sr.id, 'confirm');
    });

    // 반대 방향도 확인한다 — 신청자의 확인이 담당자 화면에 보이는가.
    await withPersona(browser, 'engineer', async (page) => {
      await openSR(page, sr);
      await expect(
        statusBadge(page, sr, '확인완료'),
        'CLIENT 의 확인 완료가 ENGINEER 화면에 반영되지 않았다'
      ).toBeVisible({ timeout: 20000 });

      // 확인완료 SR 에는 담당자용 완료 액션이 남지 않아야 한다.
      await expect(page.getByRole('button', { name: '완료 처리' })).toHaveCount(0);
    });
  });

  /**
   * 예전에는 `test.fixme('동시 댓글 작성 및 충돌 방지')` 로 본문이 비어 있었다.
   * 빈 fixme 는 "언젠가 하겠다" 는 표시일 뿐 아무 정보가 없어서, 실제로 확인 가능한
   * 계약이 무엇인지부터 정했다: 댓글 생성은 append-only 트랜잭션이므로
   * (src/app/api/srs/[id]/comments/route.ts 의 $transaction) **동시 작성이 서로를
   * 덮어써서는 안 된다.** 낙관적 갱신이나 upsert 로 바뀌어 한쪽이 유실되면 여기서 잡힌다.
   * (편집 충돌 감지 같은 기능은 앱에 존재하지 않으므로 검증 대상이 아니다 —
   *  SRComment 에는 수정 UI 도 버전 필드도 없다.)
   */
  test('CLIENT 와 ENGINEER 가 동시에 단 댓글은 둘 다 유실 없이 남는다', async ({ browser }) => {
    const stamp = `${Date.now()}`;
    const sr = await seedSR(browser, {
      stage: 'IN_PROGRESS',
      title: `협업 동시 댓글 ${stamp}`,
    });
    seededIds.push(sr.id);

    const clientBody = `동시 작성 - 고객 ${stamp}`;
    const engineerBody = `동시 작성 - 엔지니어 ${stamp}`;

    const clientContext = await browser.newContext({ storageState: PERSONA_AUTH_FILES.client });
    const engineerContext = await browser.newContext({ storageState: PERSONA_AUTH_FILES.engineer });

    try {
      const clientPage = await clientContext.newPage();
      const engineerPage = await engineerContext.newPage();

      // 두 화면을 먼저 같은 SR 에 올려 둔다 (둘 다 "댓글 0건" 상태에서 출발한다).
      await Promise.all([openSR(clientPage, sr), openSR(engineerPage, sr)]);

      // 같은 순간에 제출한다. 어느 쪽이 먼저 커밋되는지는 보장하지 않는다.
      await Promise.all([
        postComment(clientPage, sr, clientBody),
        postComment(engineerPage, sr, engineerBody),
      ]);

      // 제3자(내부 처리자) 화면에서 둘 다 살아 있는지 본다 —
      // 각자 자기 화면만 보면 "상대 것이 사라진" 회귀를 놓친다.
      await withPersona(browser, 'legacyManager', async (page) => {
        await openSR(page, sr);
        await expect(commentItem(page, clientBody), 'CLIENT 댓글이 유실되었다').toHaveCount(1);
        await expect(commentItem(page, engineerBody), 'ENGINEER 댓글이 유실되었다').toHaveCount(1);
      });
    } finally {
      await Promise.all([clientContext.close(), engineerContext.close()]);
    }
  });

  /**
   * 예전에는 `test.fixme('담당자 부재 시 재배정')` 이었다.
   *
   * "부재(out-of-office)" 는 앱 어디에도 없는 개념이다 — 사용자 스키마에도, 배정
   * 로직(src/app/api/srs/[id]/intake/route.ts)에도 부재 상태나 자동 재배정 트리거가
   * 없다. 그래서 트리거는 사람이 누르는 것으로 두고, **관측 가능한 결과** 를 검증한다:
   * 재배정하면 이전 담당자의 접근권이 즉시 끊기고(canReadSR 은 ENGINEER 에게
   * `sr.assigneeId === user.id` 를 요구한다, src/lib/policies.ts) 신청자 화면의
   * 담당자 필드가 새 담당자로 바뀐다. 재배정 폼 자체의 동작은 18 이 덮으므로
   * 여기서는 "상대 화면에 무엇이 보이는가" 만 본다.
   */
  test('재배정하면 이전 담당자는 SR 을 열 수 없고 CLIENT 화면의 담당자가 바뀐다', async ({
    browser,
  }) => {
    const stamp = `${Date.now()}`;
    const sr = await seedSR(browser, { stage: 'INTAKE', title: `협업 재배정 ${stamp}` });
    seededIds.push(sr.id);

    // 전제: 재배정 전에는 담당 ENGINEER 가 열 수 있다.
    await withPersona(browser, 'engineer', async (page) => {
      await openSR(page, sr);
    });

    // 내부 처리자가 접수 정보 수정 화면에서 담당자를 자신으로 바꾼다.
    const newAssigneeName = await withPersona(browser, 'legacyManager', async (page) => {
      await page.goto(`/srs/${sr.id}/intake`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await expect(page.getByRole('heading', { name: 'SR 접수 정보 수정' })).toBeVisible({
        timeout: 20000,
      });

      await selectAssignee(page, ADMIN_EMAIL);

      // 예상 작업 시간을 다시 입력해야 저장이 된다. **앱 결함이다**:
      // GET /api/srs/{id}/intake 는 Prisma Decimal 인 estimatedHours 를 문자열("4")로
      // 직렬화하는데, use-intake-form.ts 의 수정 모드가 그 문자열을 그대로
      // `z.number()` 필드에 setValue 한다. 그래서 이 칸을 건드리지 않고 저장하면
      // "Invalid input" 으로 막혀 담당자만 바꾸는 것이 불가능하다.
      // 결함이 고쳐져도 이 한 줄은 무해하므로(사용자가 실제로 하는 입력이다) 남겨 둔다.
      await page.getByLabel(/예상 작업 시간/).fill('6');

      const patched = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/srs/${sr.id}/intake`) &&
          response.request().method() === 'PATCH',
        { timeout: 20000 }
      );
      await page.getByRole('button', { name: '저장' }).click();

      const response = await patched;
      const payload = await response.text().catch(() => '(본문 없음)');
      expect(response.status(), `재배정이 거부되었다. 응답: ${payload.slice(0, 300)}`).toBe(200);

      return displayName(page);
    });

    // 이전 담당자 화면: 상세가 열리지 않고 오류 화면이 뜬다.
    await withPersona(browser, 'engineer', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await expect(
        page.getByRole('heading', { name: 'SR을 불러올 수 없습니다' }),
        '재배정 후에도 이전 담당자가 SR 을 열 수 있다 (canReadSR 격리가 깨졌다)'
      ).toBeVisible({ timeout: 20000 });
      await expect(page.getByTestId('sr-title')).toHaveCount(0);
    });

    // 신청자 화면: 담당자 필드가 새 담당자로 바뀌어 보인다.
    await withPersona(browser, 'client', async (page) => {
      await openSR(page, sr);
      const assigneeField = page
        .getByRole('heading', { name: '담당자', exact: true })
        .locator('..');
      await expect(
        assigneeField,
        '재배정 결과가 CLIENT 화면의 담당자 필드에 반영되지 않았다'
      ).toContainText(newAssigneeName);
    });
  });
});
