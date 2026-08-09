import { APIRequestContext, Browser, expect, Page, Request, test } from '@playwright/test';

import { deleteSeededSRs, seedSR } from './fixtures/sr';
import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';

/**
 * 실시간(SSE) 갱신.
 *
 * ── 이 파일이 생긴 이유 ──────────────────────────────────────────────────
 * 스위트 전체가 `/api/realtime` 때문에 `networkidle` 을 피한다는 주석을 달고 있으면서
 * (00-smoke, helpers/test-helpers, README), 정작 **그 기능 자체는 한 번도 검증된 적이
 * 없다.** SSE 가 통째로 끊겨도 전부 초록불이었다는 뜻이다.
 *
 * ── 계약 ─────────────────────────────────────────────────────────────────
 * 서버: src/app/api/realtime/route.ts 가 `event: <name>\ndata: <json>\n\n` 로 흘린다.
 *       연결별로 canReadSR 필터를 걸고, 이벤트를 유발한 당사자(actorId)에게는
 *       에코하지 않는다.
 * 클라이언트: src/hooks/use-realtime-status.ts 가 EventSource 를 열고
 *       sr:created / sr:updated 에서 토스트를 띄운 뒤 `router.refresh()` 로
 *       SSR 화면(=/srs 목록)을 다시 받아 온다.
 *
 * 그래서 관측 가능한 결과는 두 겹이다 — (1) 토스트 문구, (2) 목록 자체의 갱신.
 * 둘 다 단언한다. 토스트만 보면 "토스트는 뜨는데 목록은 그대로" 라는 실제 회귀
 * (use-realtime-status.ts 주석의 감사 3.26)를 다시 놓친다.
 *
 * 관찰자는 ADMIN 이고 변경을 일으키는 쪽은 CLIENT_USER / ENGINEER 다.
 * legacyManager(manager.json)는 admin@example.com 이라 관찰자와 같은 사용자이므로
 * 에코 억제에 걸린다 — 그래서 트리거 역할로 쓰지 않는다.
 */

test.use({ storageState: PERSONA_AUTH_FILES.admin });

/** 정리 대상. 공유 DB 이므로 이 파일이 만든 것만 지운다. */
const seededSRIds: string[] = [];

test.afterAll(async ({ browser }) => {
  await deleteSeededSRs(browser, seededSRIds);
});

/**
 * 스트림이 붙었다고 판정하는 기준은 **응답이 아니라 요청**이다.
 *
 * 실측(2026-08): `/api/realtime` 은 연결 직후 아무 바이트도 내보내지 않는다. 첫 바이트는
 * 30초 뒤의 keep-alive(`: keep-alive`) 이거나 실제 이벤트다. 그래서 응답 헤더가 그때까지
 * 버퍼에 잡혀 있고, `waitForResponse` 는 정확히 30초를 기다린다(EventSource 의 onopen 도
 * 마찬가지로 30초 늦게 뜬다 — route.ts 에 초기 flush 가 없는 탓이다. 보고서에 적었다).
 *
 * 반면 서버는 라우트 핸들러가 실행되는 시점, 즉 `new ReadableStream(...)` 의 start() 에서
 * realtimeEmitter 리스너를 등록하고, 브라우저 쪽 addEventListener 도 `new EventSource(...)`
 * 직후 동기적으로 붙는다. 요청이 나갔다는 것으로 충분한 이유다.
 *
 * 요청 관측 뒤에 같은 서버로 왕복 한 번(세션 조회)을 더 넣어, 그 사이에 SSE 핸들러가
 * 확실히 실행되도록 한다. 이후의 트리거는 브라우저 컨텍스트 생성과 여러 번의 왕복을
 * 더 거치므로 경합 여지가 남지 않는다.
 */
async function connectRealtime(page: Page, path: string): Promise<Request> {
  const streamRequested = page.waitForRequest(
    (request) => request.url().includes('/api/realtime'),
    { timeout: 30000 }
  );
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  const streamRequest = await streamRequested;

  const roundTrip = await page.request.get('/api/auth/session');
  expect(roundTrip.status(), '세션 조회 왕복이 실패했습니다.').toBe(200);

  return streamRequest;
}

/**
 * 스트림의 응답 계약. 첫 이벤트가 도착해 헤더가 flush 된 **뒤에** 호출해야 한다
 * (위 주석의 이유로 그 전에는 30초간 응답이 관측되지 않는다).
 */
async function expectSSEResponse(streamRequest: Request): Promise<void> {
  const response = await streamRequest.response();
  expect(response, '/api/realtime 응답이 없습니다.').toBeTruthy();
  expect(response!.status(), '/api/realtime 이 스트림을 열지 못했습니다.').toBe(200);
  expect(
    response!.headers()['content-type'],
    '/api/realtime 이 SSE 가 아닌 응답을 돌려줬습니다.'
  ).toContain('text/event-stream');
}

/** 세션 사용자 id (에코 억제 검증에 쓴다). */
async function sessionUserId(request: APIRequestContext): Promise<string> {
  const response = await request.get('/api/auth/session');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { user?: { id?: string } };
  expect(body.user?.id, '세션에 사용자 id 가 없습니다.').toBeTruthy();
  return body.user!.id!;
}

/** 다른 페르소나 세션으로 상태를 전이시킨다. 트리거이자 전제이므로 응답을 단언한다. */
async function transitionAs(
  browser: Browser,
  persona: 'engineer' | 'client',
  srId: string,
  data: Record<string, unknown>
): Promise<void> {
  const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES[persona] });
  try {
    const response = await context.request.patch(`/api/srs/${srId}/status`, { data });
    expect(
      response.status(),
      `${persona} 의 상태 전이(${JSON.stringify(data)})가 실패했습니다: ${await response.text()}`
    ).toBe(200);
  } finally {
    await context.close();
  }
}

/** SR 목록의 행. SRListItem 의 `aria-label="SR <번호> 상세 보기"` 를 겨냥한다. */
const srRow = (page: Page, srNumber: string) =>
  page.getByRole('row', { name: `SR ${srNumber} 상세 보기` });

test.describe('실시간 갱신 (SSE)', () => {
  test('다른 사용자가 만든 SR 이 토스트와 목록에 실시간으로 나타난다', async ({
    page,
    browser,
  }) => {
    const streamRequest = await connectRealtime(page, '/srs');
    await expect(page.getByRole('heading', { name: 'SR 목록', exact: true })).toBeVisible();

    // CLIENT_USER 가 SR 을 만든다 → sr:created (actorId = clientuser ≠ 관찰자)
    const sr = await seedSR(browser, { stage: 'REQUESTED' });
    seededSRIds.push(sr.id);

    // (1) use-realtime-status.ts 의 sr:created 핸들러가 띄우는 토스트.
    //     제목+설명이 이어 붙은 낭독기용 노드와 겹치지 않도록 exact 로 겨냥한다.
    await expect(
      page.getByText(`새로운 SR #${sr.srNumber}가 등록되었습니다.`, { exact: true })
    ).toBeVisible();

    // (2) 토스트만이 아니라 SSR 목록이 실제로 다시 그려져야 한다(scheduleRefresh).
    //     기본 정렬이 createdAt.desc 이므로 새 SR 은 1페이지에 들어온다.
    await expect(srRow(page, sr.srNumber)).toBeVisible({ timeout: 20000 });

    // 이벤트가 도착했으므로 이제 응답 헤더도 확정되어 있다.
    await expectSSEResponse(streamRequest);
  });

  test('다른 사용자의 상태 변경이 토스트와 목록 상태 배지에 반영된다', async ({
    page,
    browser,
  }) => {
    // 관찰 시작 전에 준비를 끝낸다. 접수는 admin 계정(manager.json)이 하므로
    // 페이지를 먼저 열면 관찰자 본인 이벤트가 되어 에코 억제로 사라진다.
    const sr = await seedSR(browser, { stage: 'INTAKE' });
    seededSRIds.push(sr.id);

    const streamRequest = await connectRealtime(page, '/srs');
    await expect(srRow(page, sr.srNumber)).toContainText('접수');

    // 담당 ENGINEER 가 진행을 시작한다 → sr:updated
    await transitionAs(browser, 'engineer', sr.id, { action: 'start' });

    await expect(
      page.getByText(`SR #${sr.srNumber}의 상태가 IN_PROGRESS로 변경되었습니다.`, { exact: true })
    ).toBeVisible();

    // 목록의 상태 배지가 '접수' → '진행중' 으로 바뀐다(lib/constants/sr.ts 의 statusLabels).
    await expect(srRow(page, sr.srNumber)).toContainText('진행중', { timeout: 20000 });

    await expectSSEResponse(streamRequest);
  });

  test('스트림은 타인의 변경만 흘리고 본인이 유발한 이벤트는 에코하지 않는다', async ({
    page,
    browser,
  }) => {
    const sr = await seedSR(browser, { stage: 'IN_PROGRESS' });
    seededSRIds.push(sr.id);

    await page.goto('/srs', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'SR 목록', exact: true })).toBeVisible();

    // 화면 대신 **스트림 자체**를 관찰한다. 여기서 payload 를 JSON 으로 파싱할 수
    // 있다는 것 자체가 `event: <name>\ndata: <json>\n\n` 형식이 지켜졌다는 증거다.
    // (앱이 이미 연 연결과 별개인 두 번째 연결이므로, 이 요청만 따로 기다린다.)
    const ownStreamRequested = page.waitForRequest(
      (request) => request.url().includes('/api/realtime'),
      { timeout: 30000 }
    );
    await page.evaluate(() => {
      const scope = window as unknown as {
        __sseEvents?: Array<{ name: string; data: Record<string, unknown> }>;
      };
      const received: Array<{ name: string; data: Record<string, unknown> }> = [];
      scope.__sseEvents = received;

      const source = new EventSource('/api/realtime');
      for (const name of ['sr:created', 'sr:updated', 'sr:deleted', 'sr:commented']) {
        source.addEventListener(name, (event) => {
          received.push({ name, data: JSON.parse((event as MessageEvent).data) });
        });
      }
    });
    const ownStreamRequest = await ownStreamRequested;

    // 이 두 번의 왕복이 위 SSE 요청보다 뒤에 처리되므로, 트리거 시점에는
    // 서버가 이미 이 연결의 리스너를 등록해 둔 상태다.
    const adminId = await sessionUserId(page.request);
    const engineerContext = await browser.newContext({
      storageState: PERSONA_AUTH_FILES.engineer,
    });
    const engineerId = await sessionUserId(engineerContext.request);
    await engineerContext.close();

    type StreamEvent = { name: string; data: Record<string, unknown> };
    const eventsForSR = (): Promise<StreamEvent[]> =>
      page.evaluate((srId) => {
        const all =
          (window as unknown as { __sseEvents?: Array<{ name: string; data: { id?: string } }> })
            .__sseEvents ?? [];
        return all.filter((entry) => entry.data.id === srId);
      }, sr.id) as Promise<StreamEvent[]>;

    // 타인(ENGINEER) → 본인(ADMIN) → 타인(ENGINEER) 순서로 세 번 바꾼다.
    // 한 스트림의 전달 순서는 발행 순서와 같으므로, 세 번째 이벤트가 도착한 시점에는
    // 두 번째(본인 유발)가 전달될 예정이었다면 이미 도착해 있어야 한다.
    // 그래서 "아직 안 왔을 뿐" 과 "오지 않는다" 를 고정 대기 없이 구분할 수 있다.
    await transitionAs(browser, 'engineer', sr.id, { action: 'hold', reason: 'E2E 보류 1' });

    const resumeResponse = await page.request.patch(`/api/srs/${sr.id}/status`, {
      data: { action: 'resume' },
    });
    expect(
      resumeResponse.status(),
      `관찰자(ADMIN) 본인의 전이가 실패했습니다: ${await resumeResponse.text()}`
    ).toBe(200);

    await transitionAs(browser, 'engineer', sr.id, { action: 'hold', reason: 'E2E 보류 2' });

    await expect
      .poll(async () => (await eventsForSR()).length, {
        timeout: 30000,
        message: 'ENGINEER 가 일으킨 sr:updated 두 건이 SSE 로 도착하지 않았습니다.',
      })
      .toBe(2);

    const events = await eventsForSR();
    expect(
      events.map((entry) => entry.name),
      'sr:updated 가 아닌 이름으로 흘렀습니다.'
    ).toEqual(['sr:updated', 'sr:updated']);
    expect(
      events.map((entry) => entry.data.status),
      '보류 두 건만 도착해야 합니다 — IN_PROGRESS 가 섞였다면 본인 이벤트가 에코된 것입니다.'
    ).toEqual(['ON_HOLD', 'ON_HOLD']);
    expect(
      events.map((entry) => entry.data.actorId),
      `에코 억제(route.ts 의 canReceive)가 깨져 관찰자 본인(${adminId})의 이벤트가 흘러왔습니다.`
    ).toEqual([engineerId, engineerId]);
    expect(events.map((entry) => entry.data.srNumber)).toEqual([sr.srNumber, sr.srNumber]);
    expect(events.map((entry) => entry.data.clientId)).toEqual([sr.clientId, sr.clientId]);

    await expectSSEResponse(ownStreamRequest);
  });
});
