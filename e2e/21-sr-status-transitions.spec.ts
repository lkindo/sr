import {
  type APIRequestContext,
  type Browser,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { deleteSeededSRs, holdReleaseDate, seedSR, type SRStage } from './fixtures/sr';
import { PERSONA_AUTH_FILES, type PersonaKey } from './helpers/auth-helpers';
import { changeSRStatus, checkA11y } from './helpers/test-helpers';

/**
 * SR 상태 전이 (State Transition) E2E 테스트
 *
 * ── 이 파일이 왜 통째로 다시 쓰였는가 ─────────────────────────────────────
 * 이전 판은 상태를 `page.locator('text=/완료|COMPLETED/i').first()` 로 확인했다.
 * 그런데 상세 화면의 상태 배지 문구는 `src/lib/constants/sr.ts` 의 statusLabels 이고
 * ('완료', '보류', '거절' …), 같은 화면에는 '완료 처리' · '보류' · '거절' **버튼**이 있다.
 * 넓은 텍스트 매칭은 버튼에 먼저 걸리므로
 *   - `text=/보류|ON_HOLD/i` 는 보류 **버튼**에 걸렸고
 *   - `text=/거절|REJECTED/i` 는 거절 **버튼**에 걸렸으며
 *   - `text=/완료|COMPLETED/i` 는 '완료 처리' 버튼에 걸렸다
 * 즉 상태가 하나도 바뀌지 않아도 전부 초록불이었다. 거기에 관용 분기 14개와
 * 고정 대기 25회(35.6초)가 얹혀 "버튼이 없으면 로그만 남기고 통과"까지 하고 있었다.
 *
 * ⚠️ 2026-08-09: ON_HOLD 라벨이 '대기' → '보류' 로 통일되면서 **배지와 버튼이 같은
 * 글자**가 됐다. 예전에는 배지가 '대기' 라 `text=보류` 가 배지를 "애초에 못 만나는"
 * 것이 우연한 안전장치였는데, 그 안전장치가 사라졌다. 그래서 배지 단언은 텍스트가
 * 아니라 `data-testid="sr-status-badge"` 로 겨냥한다(아래 expectStatusBadge).
 *
 * ── 다시 쓴 원칙 ──────────────────────────────────────────────────────────
 * 1. 준비는 `fixtures/sr.ts` 의 API 픽스처로 한다. 각 테스트가 자기 시작 상태의 SR 을
 *    직접 만들기 때문에 serial 모드를 없앨 수 있었다 — 1번이 실패해도 나머지가
 *    skip 되지 않고 각자 판정된다.
 * 2. 전이는 `helpers/test-helpers.ts` 의 `changeSRStatus` 로 한다. 액션 버튼이 없거나
 *    PATCH /api/srs/{id}/status 가 200 이 아니면 그 자리에서 실패한다.
 * 3. 결과는 **두 겹으로** 단언한다.
 *    (a) UI: 헤더의 상태 배지 문구 (아래 `detailHeader` 로 범위를 좁혀 버튼과 분리)
 *    (b) 서버: GET /api/srs/{id} 의 status 필드
 *    (b)가 핵심이다 — 낙관적 업데이트(src/hooks/use-sr.ts 의 onMutate)가 화면을 먼저
 *    바꾸므로 UI 만 보면 "버튼만 눌리고 서버는 그대로" 를 구분할 수 없다.
 *
 * API 엔드포인트: PATCH /api/srs/[id]/status
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. "500ms 동안 네트워크 요청 0건"이라는 조건이 영원히 성립하지 않는다.
 */

// ============================================================================
// 공통 유틸
// ============================================================================

/**
 * e2e 전용 Prisma 인스턴스 — 재오픈 창 만료 검증에서 completedAt 을 과거로 되돌리는 데만 쓴다.
 *
 * 공개 API 에는 completedAt 을 소급 설정하는 경로가 없고(srUpdateSchema 에 필드가 없다),
 * 판정은 서버 시계로 일어나 브라우저 시계를 돌려도 소용없다. 그래서 준비 단계만 DB 에 직접
 * 쓴다. 앱 싱글턴(`src/lib/prisma.ts`)을 쓰지 않는 이유는 sr-permissions.spec.ts 주석과 같다
 * (`server-only` 가 plain Node 에서 import 즉시 throw 한다).
 *
 * 연결은 첫 사용 때 맺는다. 이 파일의 다른 테스트만 골라 돌릴 때 DB 연결을 강요하지 않는다.
 */
let prismaClient: PrismaClient | undefined;
function e2ePrisma(): PrismaClient {
  prismaClient ??= new PrismaClient();
  return prismaClient;
}

test.afterAll(async () => {
  // 끊지 않으면 Playwright 워커가 커넥션을 물고 종료를 기다린다.
  await prismaClient?.$disconnect();
});

/** 서버 문구를 그대로 정규식에 넣기 위한 이스케이프(문구에 괄호·마침표가 있다). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 상태 배지 문구. `src/lib/constants/sr.ts` 의 statusLabels 와 반드시 같아야 한다.
 * 여기 값이 앱과 어긋나면 배지를 못 찾아 실패한다 — 그것이 의도한 동작이다
 * (라벨이 조용히 바뀌는 것을 이 스펙이 잡아야 한다).
 */
const STATUS_LABELS: Record<SRStage, string> = {
  REQUESTED: '요청됨',
  INTAKE: '접수',
  IN_PROGRESS: '진행중',
  ON_HOLD: '보류',
  COMPLETED: '완료',
  CONFIRMED: '확인완료',
  REJECTED: '거절',
};

/**
 * 상세 화면이 노출할 수 있는 상태 액션 버튼 전체 (SRStatusActions 의 aria-label).
 * "불가능한 전이가 UI 에 뜨지 않는가" 를 확인할 때 이 목록을 통째로 훑는다.
 */
const ALL_ACTION_BUTTONS = [
  '접수하기',
  '진행 시작',
  '완료 처리',
  '보류',
  '진행 재개',
  '거절',
  '확인 완료',
  '재오픈',
] as const;

/**
 * 상세 헤더 영역.
 *
 * 상태 배지는 `src/app/(dashboard)/srs/[id]/page.tsx` 에서 SR 번호(h1) 옆에 렌더되는데
 * data-testid 가 없다. 같은 문구('진행중' 등)의 배지가 하단 상태 변경 이력 타임라인에도
 * 있으므로 화면 전체에서 텍스트로 찾으면 무엇을 보고 있는지 알 수 없다.
 * 유일하게 안정적인 훅이 형제 요소인 `data-testid="sr-title"` 이라 그 부모를 헤더로 삼는다.
 */
function detailHeader(page: Page): Locator {
  return page.locator('div:has(> p[data-testid="sr-title"])');
}

/**
 * 헤더의 상태 배지가 기대한 상태인지 단언한다.
 *
 * 배지를 **testid 로** 집는다. 문구로 집으면 안 된다 — ON_HOLD 라벨이 '보류' 가 되면서
 * 같은 화면의 '보류' 버튼과 글자가 같아졌다. 그래도 문구는 함께 단언한다:
 * testid 만 보면 배지가 엉뚱한 상태를 그려도 통과하기 때문이다.
 */
async function expectStatusBadge(page: Page, srId: string, stage: SRStage): Promise<void> {
  const header = detailHeader(page);
  await expect(header, `SR ${srId}: 상세 헤더가 렌더되지 않았습니다.`).toBeVisible();
  const badge = page.getByTestId('sr-status-badge');
  await expect(badge, `SR ${srId}: 상태 배지를 찾지 못했습니다.`).toBeVisible();
  await expect(
    badge,
    `SR ${srId}: 상태 배지가 '${STATUS_LABELS[stage]}'(${stage}) 가 아닙니다.`
  ).toHaveText(STATUS_LABELS[stage]);
}

/** 페르소나 세션으로 페이지를 열고 끝나면 컨텍스트를 정리한다. */
async function withPage<T>(
  browser: Browser,
  persona: PersonaKey,
  action: (page: Page) => Promise<T>
): Promise<T> {
  const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES[persona] });
  try {
    return await action(await context.newPage());
  } finally {
    await context.close();
  }
}

/** 페르소나 세션으로 API 요청 컨텍스트를 열고 끝나면 정리한다. */
async function withApi<T>(
  browser: Browser,
  persona: PersonaKey,
  action: (request: APIRequestContext) => Promise<T>
): Promise<T> {
  const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES[persona] });
  try {
    return await action(context.request);
  } finally {
    await context.close();
  }
}

/**
 * 서버에 실제로 반영된 상태를 확인한다.
 *
 * UI 단언만으로는 부족하다: 상태 변경은 낙관적 업데이트라 PATCH 가 실패해도
 * 화면은 잠깐 바뀐 것처럼 보인다. 이 단언이 "버튼만 눌리고 아무 일도 없었다" 를 잡는다.
 */
async function expectServerStatus(
  browser: Browser,
  srId: string,
  expected: SRStage
): Promise<void> {
  await withApi(browser, 'admin', async (request) => {
    const response = await request.get(`/api/srs/${srId}`);
    expect(response.status(), `GET /api/srs/${srId} 가 200 이 아닙니다.`).toBe(200);
    const body = (await response.json()) as { status?: string };
    expect(body.status, `SR ${srId}: 서버에 반영된 상태가 다릅니다.`).toBe(expected);
  });
}

/**
 * 다이얼로그를 거치는 전이(complete / hold / reject / reopen)는 성공 후
 * `SRStatusChangeDialog` 가 `router.push('/srs')` 로 목록으로 되돌린다.
 * 그 이동이 끝나기 전에 상세로 되돌아가면 곧바로 목록으로 튕겨 단언이 흔들리므로,
 * 이동 자체를 기다릴 이벤트로 삼는다.
 */
async function waitForListRedirect(page: Page): Promise<void> {
  await page.waitForURL(/\/srs(\?|$)/, { timeout: 20000 });
}

/** 상세 화면을 다시 열고 상태 배지를 확인한다 (다이얼로그 전이 뒤 재확인용). */
async function reopenDetailAndExpect(page: Page, srId: string, stage: SRStage): Promise<void> {
  await page.goto(`/srs/${srId}`, { waitUntil: 'domcontentloaded' });
  await expectStatusBadge(page, srId, stage);
}

// ============================================================================
// 정상 전이 7종
// ============================================================================

test.describe('SR 상태 전이 — 정상 경로', () => {
  const seededIds: string[] = [];

  test.afterAll(async ({ browser }) => {
    await deleteSeededSRs(browser, seededIds);
  });

  test('INTAKE → IN_PROGRESS (진행 시작)', async ({ browser }) => {
    test.setTimeout(90000);
    const sr = await seedSR(browser, { stage: 'INTAKE', title: '전이 테스트 start' });
    seededIds.push(sr.id);

    await withPage(browser, 'engineer', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'INTAKE');

      // changeSRStatus 는 버튼 부재 / PATCH 비 200 을 모두 실패로 만든다.
      await changeSRStatus(page, sr.id, 'start');

      await expectStatusBadge(page, sr.id, 'IN_PROGRESS');
    });

    await expectServerStatus(browser, sr.id, 'IN_PROGRESS');
  });

  test('IN_PROGRESS → ON_HOLD (보류, 사유·예상 해제일 필수)', async ({ browser }) => {
    test.setTimeout(90000);
    const sr = await seedSR(browser, { stage: 'IN_PROGRESS', title: '전이 테스트 hold' });
    seededIds.push(sr.id);

    // 헌법 §2: 보류는 사유 **와** 예상 해제일을 함께 받는다. 다이얼로그가 날짜 입력을
    // 요구하고, 라우트는 날짜가 없으면 400 을 돌려준다.
    const expectedHoldReleaseDate = holdReleaseDate();

    await withPage(browser, 'engineer', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'IN_PROGRESS');

      await changeSRStatus(page, sr.id, 'hold', {
        reason: '고객사 추가 정보 요청으로 인한 보류',
        expectedHoldReleaseDate,
      });

      await waitForListRedirect(page);
      await reopenDetailAndExpect(page, sr.id, 'ON_HOLD');
    });

    await expectServerStatus(browser, sr.id, 'ON_HOLD');

    // 다이얼로그에서 고른 날짜가 실제로 저장되었는지도 서버 기준으로 확인한다.
    await withApi(browser, 'admin', async (request) => {
      const response = await request.get(`/api/srs/${sr.id}`);
      expect(response.status(), `GET /api/srs/${sr.id} 가 200 이 아닙니다.`).toBe(200);
      const body = (await response.json()) as { expectedHoldReleaseDate?: string | null };
      expect(
        body.expectedHoldReleaseDate?.slice(0, 10),
        `SR ${sr.id}: 보류 다이얼로그에서 입력한 예상 해제일이 서버에 저장되지 않았습니다.`
      ).toBe(expectedHoldReleaseDate);
    });
  });

  test('ON_HOLD → IN_PROGRESS (진행 재개)', async ({ browser }) => {
    test.setTimeout(90000);
    const sr = await seedSR(browser, { stage: 'ON_HOLD', title: '전이 테스트 resume' });
    seededIds.push(sr.id);

    await withPage(browser, 'engineer', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'ON_HOLD');

      await changeSRStatus(page, sr.id, 'resume');

      await expectStatusBadge(page, sr.id, 'IN_PROGRESS');
    });

    await expectServerStatus(browser, sr.id, 'IN_PROGRESS');
  });

  test('IN_PROGRESS → COMPLETED (완료 처리, 해결 내용 필수)', async ({ browser }) => {
    test.setTimeout(90000);
    const sr = await seedSR(browser, { stage: 'IN_PROGRESS', title: '전이 테스트 complete' });
    seededIds.push(sr.id);

    await withPage(browser, 'engineer', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'IN_PROGRESS');

      await changeSRStatus(page, sr.id, 'complete', {
        resolutionDescription: '문제가 해결되었습니다. E2E 완료 처리.',
      });

      await waitForListRedirect(page);
      await reopenDetailAndExpect(page, sr.id, 'COMPLETED');
    });

    await expectServerStatus(browser, sr.id, 'COMPLETED');
  });

  test('COMPLETED → CONFIRMED (확인 완료는 신청자만 가능)', async ({ browser }) => {
    test.setTimeout(90000);
    const sr = await seedSR(browser, { stage: 'COMPLETED', title: '전이 테스트 confirm' });
    seededIds.push(sr.id);

    // 담당 엔지니어는 신청자가 아니므로 확인 완료 버튼이 아예 없어야 한다.
    // (SRStatusActions 의 COMPLETED 분기: canConfirm — 신청자 본인 등 — 일 때만 렌더한다.)
    await withPage(browser, 'engineer', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'COMPLETED');
      await expect(
        page.getByRole('button', { name: '확인 완료', exact: true }),
        `SR ${sr.id}: 신청자가 아닌 담당자에게 확인 완료 버튼이 보입니다.`
      ).toHaveCount(0);
    });

    // 신청자(CLIENT_USER)는 확인할 수 있다.
    await withPage(browser, 'client', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'COMPLETED');

      await changeSRStatus(page, sr.id, 'confirm');

      await expectStatusBadge(page, sr.id, 'CONFIRMED');
    });

    await expectServerStatus(browser, sr.id, 'CONFIRMED');
  });

  test('REQUESTED → REJECTED (거절, 사유 필수) 후 종료 상태에는 액션이 없다', async ({
    browser,
  }) => {
    test.setTimeout(90000);
    const sr = await seedSR(browser, { stage: 'REQUESTED', title: '전이 테스트 reject' });
    seededIds.push(sr.id);

    await withPage(browser, 'legacyManager', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'REQUESTED');

      await changeSRStatus(page, sr.id, 'reject', {
        reason: '요구사항이 불명확하여 거절합니다.',
      });

      await waitForListRedirect(page);
      await reopenDetailAndExpect(page, sr.id, 'REJECTED');

      // REJECTED 는 종료 상태다 (sr-state-machine 의 VALID_TRANSITIONS.REJECTED = []).
      // 어떤 상태 액션도 남아 있으면 안 된다.
      for (const name of ALL_ACTION_BUTTONS) {
        await expect(
          page.getByRole('button', { name, exact: true }),
          `SR ${sr.id}: 종료 상태(REJECTED)인데 '${name}' 버튼이 남아 있습니다.`
        ).toHaveCount(0);
      }
    });

    await expectServerStatus(browser, sr.id, 'REJECTED');
  });

  test('CONFIRMED → IN_PROGRESS (완료 후 7일 이내 재오픈)', async ({ browser }) => {
    test.setTimeout(90000);
    const sr = await seedSR(browser, { stage: 'CONFIRMED', title: '전이 테스트 reopen' });
    seededIds.push(sr.id);

    // 재오픈은 신청자 또는 ADMIN/MANAGER 만 가능하다 (TRANSITION_ROLES.CONFIRMED).
    await withPage(browser, 'client', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'CONFIRMED');

      await changeSRStatus(page, sr.id, 'reopen', {
        reason: '추가 문제가 발견되어 재오픈합니다.',
      });

      await waitForListRedirect(page);
      await reopenDetailAndExpect(page, sr.id, 'IN_PROGRESS');
    });

    await expectServerStatus(browser, sr.id, 'IN_PROGRESS');
  });
});

// ============================================================================
// 불가능한 전이 차단
// ============================================================================

test.describe('SR 상태 전이 — 불가능한 전이 차단', () => {
  const seededIds: string[] = [];

  test.afterAll(async ({ browser }) => {
    await deleteSeededSRs(browser, seededIds);
  });

  test('CONFIRMED 상태에서는 진행/완료/보류 액션이 UI 에도 API 에도 없다', async ({ browser }) => {
    test.setTimeout(90000);
    const sr = await seedSR(browser, { stage: 'CONFIRMED', title: '차단 테스트 confirmed' });
    seededIds.push(sr.id);

    // (1) UI: 담당 엔지니어에게는 CONFIRMED 상태의 액션이 하나도 없어야 한다.
    //     ENGINEER 는 CONFIRMED → IN_PROGRESS 재오픈 권한이 없으므로(SR:CONFIRM 필요)
    //     SRStatusActions 의 CONFIRMED 분기가 null 을 반환한다.
    await withPage(browser, 'engineer', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'CONFIRMED');

      for (const name of ALL_ACTION_BUTTONS) {
        await expect(
          page.getByRole('button', { name, exact: true }),
          `SR ${sr.id}: CONFIRMED 상태의 담당자 화면에 '${name}' 버튼이 있습니다.`
        ).toHaveCount(0);
      }
    });

    // (2) API: 버튼이 없다는 것만으로는 서버가 막는다는 증거가 아니다. 직접 때려서
    //     400 인지 확인한다 (src/app/api/srs/[id]/status/route.ts 의 사전조건 검사).
    await withApi(browser, 'engineer', async (request) => {
      const blocked: Array<{ action: string; message: string }> = [
        { action: 'start', message: '접수 상태에서만 진행을 시작할 수 있습니다.' },
        { action: 'complete', message: '진행중 상태에서만 완료 처리할 수 있습니다.' },
        { action: 'hold', message: '진행중 상태에서만 보류할 수 있습니다.' },
        { action: 'resume', message: '보류 상태에서만 재개할 수 있습니다.' },
        { action: 'confirm', message: '완료 상태에서만 확인할 수 있습니다.' },
      ];

      for (const { action, message } of blocked) {
        const response = await request.patch(`/api/srs/${sr.id}/status`, {
          data: { action, reason: '차단 검증', resolutionDescription: '차단 검증' },
        });
        expect(
          response.status(),
          `SR ${sr.id}: CONFIRMED 에서 '${action}' 이 400 으로 거부되지 않았습니다.`
        ).toBe(400);
        const body = (await response.json()) as { error?: string };
        expect(body.error, `SR ${sr.id}: '${action}' 거부 사유 문구가 다릅니다.`).toBe(message);
      }
    });

    // 다섯 번 두드린 뒤에도 상태는 그대로여야 한다.
    await expectServerStatus(browser, sr.id, 'CONFIRMED');
  });

  test('REQUESTED 상태에서 완료/재개로 건너뛸 수 없다', async ({ browser }) => {
    test.setTimeout(90000);
    const sr = await seedSR(browser, { stage: 'REQUESTED', title: '차단 테스트 requested' });
    seededIds.push(sr.id);

    // UI: 접수 전에는 진행/완료/보류 버튼이 존재하지 않는다 (접수하기·거절만 있다).
    await withPage(browser, 'legacyManager', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'REQUESTED');

      await expect(
        page.getByRole('button', { name: '접수하기', exact: true }),
        `SR ${sr.id}: REQUESTED 상태인데 접수하기 버튼이 없습니다.`
      ).toBeVisible();

      for (const name of ['진행 시작', '완료 처리', '보류', '진행 재개', '확인 완료', '재오픈']) {
        await expect(
          page.getByRole('button', { name, exact: true }),
          `SR ${sr.id}: REQUESTED 상태 화면에 '${name}' 버튼이 있습니다.`
        ).toHaveCount(0);
      }
    });

    await withApi(browser, 'legacyManager', async (request) => {
      const complete = await request.patch(`/api/srs/${sr.id}/status`, {
        data: { action: 'complete', resolutionDescription: '건너뛰기 시도' },
      });
      expect(complete.status(), `SR ${sr.id}: REQUESTED → complete 가 막히지 않았습니다.`).toBe(
        400
      );

      const resume = await request.patch(`/api/srs/${sr.id}/status`, {
        data: { action: 'resume' },
      });
      expect(resume.status(), `SR ${sr.id}: REQUESTED → resume 이 막히지 않았습니다.`).toBe(400);

      // 필수 데이터 누락도 400 이어야 한다 (거절 사유 없이 거절).
      const rejectWithoutReason = await request.patch(`/api/srs/${sr.id}/status`, {
        data: { action: 'reject' },
      });
      expect(
        rejectWithoutReason.status(),
        `SR ${sr.id}: 사유 없는 거절이 400 으로 거부되지 않았습니다.`
      ).toBe(400);
    });

    await expectServerStatus(browser, sr.id, 'REQUESTED');
  });
});

// ============================================================================
// 재오픈 제약 (7일 창)
// ============================================================================

test.describe('SR 재오픈 제약', () => {
  const seededIds: string[] = [];

  test.afterAll(async ({ browser }) => {
    await deleteSeededSRs(browser, seededIds);
  });

  test('7일 창 안에서는 재오픈 다이얼로그가 차단 안내 없이 열린다', async ({ browser }) => {
    test.setTimeout(90000);
    const sr = await seedSR(browser, { stage: 'CONFIRMED', title: '재오픈 창 안내' });
    seededIds.push(sr.id);

    await withPage(browser, 'client', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'CONFIRMED');

      // 방금 확인된 SR 이므로 재오픈 불가 안내(SRReopenBlockedNotice)는 없고 버튼은 활성이다.
      await expect(
        page.getByTestId('sr-reopen-blocked-reason'),
        `SR ${sr.id}: 7일 창 안인데 재오픈 불가 안내가 표시됩니다.`
      ).toHaveCount(0);
      const trigger = page.getByRole('button', { name: '재오픈', exact: true });
      await expect(trigger, `SR ${sr.id}: 7일 창 안인데 재오픈 버튼이 비활성입니다.`).toBeEnabled();
      await trigger.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog, `SR ${sr.id}: 재오픈 다이얼로그가 열리지 않았습니다.`).toBeVisible();

      // 안내 문구는 SRStatusChangeDialog 의 reopen.helpText 를 그대로 쓴다.
      await expect(
        dialog.getByText("재오픈 시 SR 상태가 '진행중'으로 변경됩니다.", { exact: false }),
        `SR ${sr.id}: 재오픈 안내 문구가 보이지 않습니다.`
      ).toBeVisible();

      // 다이얼로그 안에도 차단 사유(getReopenBlock 의 문구)가 없어야 하고 제출도 가능해야 한다.
      await expect(
        dialog.getByText('재오픈할 수 없습니다'),
        `SR ${sr.id}: 7일 창 안인데 다이얼로그에 차단 안내가 표시됩니다.`
      ).toHaveCount(0);
      await expect(
        dialog.getByRole('button', { name: '재오픈', exact: true }),
        `SR ${sr.id}: 7일 창 안인데 재오픈 제출 버튼이 비활성입니다.`
      ).toBeEnabled();

      await dialog.getByRole('button', { name: '취소', exact: true }).click();
      await expect(dialog).toBeHidden();
    });

    // 다이얼로그만 열었다 닫았으므로 상태는 그대로여야 한다.
    await expectServerStatus(browser, sr.id, 'CONFIRMED');
  });

  /**
   * 완료 20일 뒤에 확인한 SR — 상세 페이지가 기산점을 **확인 시각**으로 잡는지 보는 자리다.
   *
   * 픽스처는 상태를 API 로 밀어 올리므로 CONFIRMED SR 은 completedAt ≈ confirmedAt ≈ 지금이다.
   * 두 시각이 붙어 있으면 어느 쪽을 봐도 답이 같아서, 상세 페이지가 `getReopenAvailability`
   * 에 confirmedAt 을 넘기지 않아도 **어떤 E2E 도 그 누락을 보지 못한다**. 그런데 그 배선이
   * 정확히 이 작업이 고친 버그(늦게 확인한 SR 의 재오픈 버튼을 화면이 잘못 막음)의 자리다.
   * 그래서 **completedAt 만** 20일 전으로 되돌려 둘을 갈라놓는다:
   *   - 확인 시각을 보면 → 창 안이므로 버튼 활성, 안내 없음 (지금의 서버·화면)
   *   - 완료 시각만 보면 → '완료 후 7일이 지나' 로 버튼이 잘못 막힌다 (예전 화면)
   *
   * **비파괴다** — 재오픈 PATCH 를 실제로 보내지 않는다. 서버가 이 SR 을 허용한다는 것은
   * 위 'CONFIRMED → IN_PROGRESS' 전이 테스트와 sr-reopen-availability 의 서버·화면 동치
   * 그리드가 이미 덮고 있고, 여기서만 확인할 수 있는 것은 "페이지가 어떤 필드를 넘기는가"
   * 뿐이다. 제출까지 하면 이 SR 이 IN_PROGRESS 로 넘어가 "아무 일도 없었다" 를 마지막에
   * 단언할 수 없게 되고, 실패했을 때 원인이 배선인지 전이 흐름인지 흐려진다.
   * 대신 준비가 조용히 실패해(= 그냥 갓 확인된 SR) 테스트가 거저 통과하는 일이 없도록,
   * 두 시각이 실제로 벌어졌는지를 서버 응답으로 먼저 못박는다.
   */
  test('완료 20일 뒤에 확인한 SR 은 확인 시각 기준으로 재오픈할 수 있다', async ({ browser }) => {
    test.setTimeout(120000);
    const sr = await seedSR(browser, { stage: 'CONFIRMED', title: '재오픈 기산점' });
    seededIds.push(sr.id);

    const windowMs = 7 * 24 * 60 * 60 * 1000;
    // confirmedAt 은 건드리지 않는다 — 픽스처가 방금 찍은 값이 그대로 남아야 한다.
    await e2ePrisma().sR.update({
      where: { id: sr.id },
      data: { completedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) },
    });

    // ── 전제 확인: 완료는 창 밖, 확인은 창 안 ──────────────────────────────
    await withApi(browser, 'admin', async (request) => {
      const response = await request.get(`/api/srs/${sr.id}`);
      expect(response.status(), `GET /api/srs/${sr.id} 가 200 이 아닙니다.`).toBe(200);
      const body = (await response.json()) as {
        completedAt?: string | null;
        confirmedAt?: string | null;
      };
      expect(body.completedAt, `SR ${sr.id}: 완료 시각이 비어 있습니다.`).toBeTruthy();
      expect(body.confirmedAt, `SR ${sr.id}: 확인 시각이 비어 있습니다.`).toBeTruthy();
      expect(
        Date.now() - Date.parse(body.completedAt!),
        `SR ${sr.id}: 완료 시각이 7일 창 밖으로 되돌려지지 않았습니다 — 준비가 실패했습니다.`
      ).toBeGreaterThan(windowMs);
      expect(
        Date.now() - Date.parse(body.confirmedAt!),
        `SR ${sr.id}: 확인 시각이 7일 창 밖입니다 — 이 테스트의 전제가 깨졌습니다.`
      ).toBeLessThan(windowMs);
    });

    // ── 화면: 신청자에게 버튼이 활성이고 차단 안내가 없어야 한다 ────────────
    await withPage(browser, 'client', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'CONFIRMED');

      const trigger = page.getByRole('button', { name: '재오픈', exact: true });
      await expect(trigger, `SR ${sr.id}: 재오픈 버튼이 보이지 않습니다.`).toBeVisible();
      await expect(
        trigger,
        `SR ${sr.id}: 확인 시각 기준으로는 창 안인데 재오픈 버튼이 비활성입니다. ` +
          '상세 페이지가 getReopenAvailability 에 confirmedAt 을 넘기지 않으면 ' +
          '20일 전 completedAt 으로 판정됩니다.'
      ).toBeEnabled();
      await expect(
        page.getByTestId('sr-reopen-blocked-reason'),
        `SR ${sr.id}: 확인 시각 기준으로는 창 안인데 재오픈 불가 안내가 표시됩니다.`
      ).toHaveCount(0);
    });

    // 아무것도 제출하지 않았으므로 상태는 그대로다.
    await expectServerStatus(browser, sr.id, 'CONFIRMED');
  });

  /**
   * 완료 후 7일이 **지난** SR — 스테이징의 "ADMIN 이 재오픈을 못 한다" 보고의 재현이다.
   *
   * 예전에는 이 경우 버튼이 활성이었고, 이유는 다이얼로그를 열어야 작은 빨간 한 줄로만
   * 보였다(모바일에서는 버튼이 아이콘뿐이라 무엇이 막혔는지도 알 수 없었다). 이제는
   *   (1) 버튼이 보이되 비활성이고,
   *   (2) 이유가 헤더 아래에 **글로** 보이며(데스크톱·390px 모두),
   *   (3) 그 글은 서버가 같은 요청에 돌려주는 400 문구와 글자까지 같다.
   *
   * completedAt 을 되돌릴 공개 경로가 없어 준비 단계만 e2e 전용 Prisma 로 DB 에 쓴다
   * (위 e2ePrisma 주석). 판정 자체는 서버와 화면이 각자 실제로 수행한다.
   */
  test('완료 후 7일이 지나면 재오픈 버튼이 막히고 이유가 화면에 보인다', async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120000);
    const sr = await seedSR(browser, { stage: 'COMPLETED', title: '재오픈 창 만료' });
    seededIds.push(sr.id);

    const completedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await e2ePrisma().sR.update({ where: { id: sr.id }, data: { completedAt } });

    // ── 서버: 신청자(권한 있음)의 재오픈도 창 만료로 400 이다 ───────────────
    let serverMessage = '';
    await withApi(browser, 'client', async (request) => {
      const response = await request.patch(`/api/srs/${sr.id}/status`, {
        data: { action: 'reopen', reason: '창 만료 검증' },
      });
      const body = (await response.json()) as { error?: string };
      expect(
        response.status(),
        `SR ${sr.id}: 완료 8일 뒤의 재오픈이 400 으로 거부되지 않았습니다. 응답: ${JSON.stringify(body)}`
      ).toBe(400);
      expect(body.error, `SR ${sr.id}: 창 만료 거부 문구가 다릅니다.`).toMatch(
        /^완료 후 7일이 지나 재오픈할 수 없습니다\. \(완료 \d{4}\. \d{2}\. \d{2}\. \d{2}:\d{2} · 재오픈 기한 \d{4}\. \d{2}\. \d{2}\. \d{2}:\d{2}\) 추가 작업이 필요하면 새 SR을 등록해주세요\.$/
      );
      serverMessage = body.error!;
    });

    // ── 화면: 보고자와 같은 ADMIN 세션, 데스크톱과 모바일(390px) ────────────
    for (const { name, viewport } of [
      { name: 'desktop', viewport: { width: 1280, height: 800 } },
      { name: 'mobile-390', viewport: { width: 390, height: 844 } },
    ]) {
      const context = await browser.newContext({
        storageState: PERSONA_AUTH_FILES.admin,
        viewport,
      });
      try {
        const page = await context.newPage();
        await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
        await expectStatusBadge(page, sr.id, 'COMPLETED');

        // 이름은 '재오픈' 그대로다(모바일은 아이콘뿐이라 aria-label 이 유일한 이름이다).
        const trigger = page.getByRole('button', { name: '재오픈', exact: true });
        await expect(
          trigger,
          `[${name}] SR ${sr.id}: 재오픈 버튼이 보이지 않습니다.`
        ).toBeVisible();
        await expect(
          trigger,
          `[${name}] SR ${sr.id}: 창이 닫혔는데 재오픈 버튼이 활성입니다.`
        ).toBeDisabled();

        const notice = page.getByTestId('sr-reopen-blocked-reason');
        await expect(
          notice,
          `[${name}] SR ${sr.id}: 재오픈 불가 이유가 화면에 보이지 않습니다.`
        ).toBeVisible();
        await expect(
          notice,
          `[${name}] SR ${sr.id}: 화면의 이유가 서버 거부 문구와 다릅니다.`
        ).toContainText(serverMessage);
        await expect(
          trigger,
          `[${name}] SR ${sr.id}: 비활성 버튼이 이유 안내를 설명으로 가리키지 않습니다.`
        ).toHaveAccessibleDescription(new RegExp(escapeRegExp(serverMessage)));

        // 안내가 뜬 상태의 접근성. 30-accessibility 의 SR 상세 검사는 목록 첫 SR 을 여는데
        // 그 SR 은 보통 막혀 있지 않아 이 안내를 한 번도 검사하지 못한다. 실제로 안내 제목을
        // 헤딩(AlertTitle=<h5>)으로 그렸을 때 h1 → h5 → h2 가 되어 여기서 heading-order 가
        // 걸렸다 — 그 회귀를 막는 자리다.
        await checkA11y(page, `SR Detail (재오픈 차단, ${name})`, '[data-testid="sr-title"]');

        // 390px 에서도 안내가 화면 폭 안에 들어와야 읽을 수 있다(가로 스크롤 금지).
        const box = await notice.boundingBox();
        expect(box, `[${name}] SR ${sr.id}: 안내의 위치를 측정할 수 없습니다.`).not.toBeNull();
        expect(
          box!.x + box!.width,
          `[${name}] SR ${sr.id}: 안내가 화면 폭(${viewport.width}px)을 넘칩니다.`
        ).toBeLessThanOrEqual(viewport.width);

        await page.screenshot({
          path: testInfo.outputPath(`reopen-blocked-${name}.png`),
          fullPage: false,
        });
      } finally {
        await context.close();
      }
    }

    // 버튼이 막혀 있었으므로 상태는 그대로다.
    await expectServerStatus(browser, sr.id, 'COMPLETED');
  });
});

// ============================================================================
// 상태 이력
// ============================================================================

test.describe('SR 상태 이력', () => {
  const seededIds: string[] = [];

  test.afterAll(async ({ browser }) => {
    await deleteSeededSRs(browser, seededIds);
  });

  test('전이할 때마다 상태 이력이 쌓이고 타임라인에 표시된다', async ({ browser }) => {
    test.setTimeout(90000);
    const sr = await seedSR(browser, { stage: 'COMPLETED', title: '상태 이력 확인' });
    seededIds.push(sr.id);

    // API: 생성 → 접수 → 진행 → 완료 네 건이 최신순으로 기록되어야 한다.
    await withApi(browser, 'legacyManager', async (request) => {
      const response = await request.get(`/api/srs/${sr.id}/status-history`);
      expect(response.status(), `GET /api/srs/${sr.id}/status-history`).toBe(200);

      const body = (await response.json()) as {
        items: Array<{ previousStatus: string | null; currentStatus: string }>;
        total: number;
      };

      expect(body.total, `SR ${sr.id}: 상태 이력 건수`).toBe(4);
      expect(
        body.items.map((item) => item.currentStatus),
        `SR ${sr.id}: 상태 이력이 최신순(COMPLETED→REQUESTED)으로 기록되지 않았습니다.`
      ).toEqual(['COMPLETED', 'IN_PROGRESS', 'INTAKE', 'REQUESTED']);
      expect(
        body.items.map((item) => item.previousStatus),
        `SR ${sr.id}: 상태 이력의 이전 상태가 전이 경로와 맞지 않습니다.`
      ).toEqual(['IN_PROGRESS', 'INTAKE', 'REQUESTED', null]);
    });

    // UI: 타임라인 카드가 이력을 렌더한다.
    // 변경 사유 문구로 단언한다 — 상태 라벨('완료' 등)은 헤더 배지와 겹치지만
    // '상태 변경: A → B' 는 타임라인 항목에만 존재한다(status/route.ts 의 기본 changeReason).
    await withPage(browser, 'legacyManager', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'COMPLETED');

      await expect(
        page.getByText('상태 변경 이력', { exact: true }),
        `SR ${sr.id}: 상태 변경 이력 카드가 없습니다.`
      ).toBeVisible();

      // 사유 문구는 **한국어 라벨**이어야 한다.
      //
      // 예전에는 이 단언이 '상태 변경: INTAKE → IN_PROGRESS' 였다. 즉 사용자에게
      // 영문 enum 이 보이는 상태를 테스트가 정상으로 못박고 있었다 — 결함이 눈에
      // 띄지 않았던 이유가 이것이다. changeReason 폴백은 statusLabels 를 쓴다.
      for (const reason of [
        'SR 생성',
        'SR 접수 처리',
        '상태 변경: 접수 → 진행중',
        '상태 변경: 진행중 → 완료',
      ]) {
        await expect(
          page.getByText(reason, { exact: true }),
          `SR ${sr.id}: 타임라인에 '${reason}' 항목이 없습니다.`
        ).toBeVisible();
      }

      // 타임라인 어디에도 영문 enum 이 남아 있으면 안 된다.
      const timeline = page.locator('div:has(> p:text-is("상태 변경 이력"))').first();
      const timelineText = (await timeline.innerText().catch(() => '')) || '';
      expect(
        timelineText.match(/REQUESTED|INTAKE|IN_PROGRESS|ON_HOLD|COMPLETED|CONFIRMED|REJECTED/g) ??
          [],
        `SR ${sr.id}: 타임라인에 영문 enum 이 그대로 보입니다.`
      ).toEqual([]);
    });
  });

  test('보류 전이가 남긴 문구에 영문 enum 이 새지 않는다', async ({ browser }) => {
    // ── 여기가 결함이었다 ────────────────────────────────────────────────
    // 상태 전이는 활동 이력 description 과 상태 이력 changeReason 을 남기는데,
    // 둘 다 enum 을 그대로 문자열에 끼워 넣었다(sr.service.ts / status/route.ts).
    // 그래서 라벨을 무엇으로 정하든 활동 이력 탭에는 "상태가 IN_PROGRESS에서
    // ON_HOLD로 변경되었습니다." 가, 타임라인에는 '보류' 배지 **바로 아래 줄**에
    // "상태 변경: IN_PROGRESS → ON_HOLD" 가 떴다. 한 화면에 한국어와 영문이 공존했다.
    //
    // ON_HOLD 를 쓰는 이유: 시드에 ON_HOLD SR 이 없어서 이 스펙이 유일한 실증 경로다.
    const sr = await seedSR(browser, { stage: 'ON_HOLD', title: '보류 문구 확인' });
    seededIds.push(sr.id);

    await withPage(browser, 'legacyManager', async (page) => {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expectStatusBadge(page, sr.id, 'ON_HOLD');

      // 활동 이력 탭의 전이 설명
      await page.getByRole('tab', { name: /활동 이력/ }).click();
      const panel = page.locator('[role="tabpanel"][data-state="active"]');
      await expect(panel.getByText(/^활동 이력 \(\d+\)$/)).toBeVisible();

      await expect(
        panel.getByText('상태가 진행중에서 보류(으)로 변경되었습니다.', { exact: true }),
        `SR ${sr.id}: 활동 이력의 전이 설명이 한국어 라벨이 아닙니다.`
      ).toBeVisible();

      const panelText = await panel.innerText();
      expect(
        panelText.match(/REQUESTED|INTAKE|IN_PROGRESS|ON_HOLD|COMPLETED|CONFIRMED|REJECTED/g) ?? [],
        `SR ${sr.id}: 활동 이력에 영문 enum 이 그대로 보입니다.`
      ).toEqual([]);
    });
  });
});
