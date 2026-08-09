import { APIRequestContext, APIResponse, Browser, expect, test } from '@playwright/test';

import {
  TRANSITION_PERMISSIONS,
  TRANSITION_ROLES,
  VALID_TRANSITIONS,
} from '../src/lib/sr-state-machine';

import { deleteSeededSRs, type SeededSR, seedSR, type SRStage } from './fixtures/sr';
import { PERSONA_AUTH_FILES, type PersonaKey } from './helpers/auth-helpers';
import { apiRequestWithRateLimitRetry } from './helpers/test-helpers';

/**
 * SR 상태 머신의 **금지 전이 전수 검증** (API 레벨).
 *
 * ── 왜 이 파일이 필요한가 ────────────────────────────────────────────────
 * 전이 규칙이 **두 곳에** 있다.
 *   (1) `src/lib/sr-state-machine.ts` 의 `VALID_TRANSITIONS` — 그래프 자체
 *   (2) `src/app/api/srs/[id]/status/route.ts` 의 switch 문 — 액션별 사전조건
 * 라우트 주석이 스스로 "전이 규칙 자체는 상태머신과 일부 중복 — 완전 통합은
 * 후속 리팩터로 남김" 이라고 인정한다. 규칙이 두 곳에 있으면 한쪽만 고치는 사고가
 * 나고, 그때 앱은 "상태머신은 막는데 라우트는 통과시킨다" 또는 그 반대가 된다.
 *
 * 21-sr-status-transitions 는 **허용된** 전이를 UI 로 훑는다. 금지 전이는
 * 매트릭스 전체가 한 번도 검증된 적이 없다. 이 파일이 그 공백을 메운다.
 *
 * ── 이 스펙의 구조 ───────────────────────────────────────────────────────
 * 1. `ACTION_SPEC` 은 **라우트의** 사전조건을 옮겨 적은 표다.
 *    - 아래 "그래프 일치" 테스트가 이 표를 `VALID_TRANSITIONS`(실제 모듈을 import
 *      한다 — 전사가 아니다)와 대조한다.
 *    - 금지 전이 매트릭스가 이 표를 실제 API 응답과 대조한다.
 *    두 대조를 잇면 "라우트 ≡ ACTION_SPEC ≡ 상태머신" 이 성립한다. 어느 한쪽만
 *    바뀌면 반드시 어느 한쪽 테스트가 깨진다.
 * 2. 매 시도 후 `GET /api/srs/{id}` 로 상태를 다시 읽는다.
 *    "400 을 돌려줬지만 쓰기는 이미 일어났다" 를 잡기 위해서다. 거부된 시도는
 *    상태를 바꾸지 않으므로 SR 하나를 그 상태의 모든 금지 액션에 재사용할 수 있다.
 *
 * ── 데이터 ───────────────────────────────────────────────────────────────
 * 시드(TEST001/TEST002, 시드 SR, 시드 계정)는 읽기만 한다. 이 파일이 만든 SR 만
 * afterAll 에서 지운다.
 */

type Action = 'start' | 'complete' | 'hold' | 'resume' | 'reject' | 'confirm' | 'reopen';

interface ActionRule {
  /** 이 액션이 성립하는 시작 상태 (라우트 switch 의 사전조건). */
  from: SRStage[];
  /** 성공했을 때의 도착 상태. */
  to: SRStage;
  /** 사전조건을 어겼을 때 라우트가 돌려주는 정확한 문구. */
  denial: string;
}

/**
 * `src/app/api/srs/[id]/status/route.ts` 의 switch 문을 그대로 옮긴 표.
 *
 * 문구까지 박아 두는 이유: 상태 코드만 보면 "400 이면 통과" 라서 라우트가 엉뚱한
 * 이유로 거부해도(예: 필수 필드 누락) 초록불이 된다. 어떤 사전조건이 걸렸는지까지
 * 고정해야 매트릭스가 상태 규칙을 검증하는 것이 된다.
 */
const ACTION_SPEC: Record<Action, ActionRule> = {
  start: {
    from: ['INTAKE'],
    to: 'IN_PROGRESS',
    denial: '접수 상태에서만 진행을 시작할 수 있습니다.',
  },
  complete: {
    from: ['IN_PROGRESS'],
    to: 'COMPLETED',
    denial: '진행중 상태에서만 완료 처리할 수 있습니다.',
  },
  hold: {
    from: ['IN_PROGRESS'],
    to: 'ON_HOLD',
    denial: '진행중 상태에서만 보류할 수 있습니다.',
  },
  resume: {
    from: ['ON_HOLD'],
    to: 'IN_PROGRESS',
    denial: '보류 상태에서만 재개할 수 있습니다.',
  },
  reject: {
    from: ['REQUESTED', 'INTAKE', 'ON_HOLD'],
    to: 'REJECTED',
    denial: '요청됨, 접수, 보류 상태에서만 거절할 수 있습니다.',
  },
  confirm: {
    from: ['COMPLETED'],
    to: 'CONFIRMED',
    denial: '완료 상태에서만 확인할 수 있습니다.',
  },
  reopen: {
    from: ['COMPLETED', 'CONFIRMED'],
    to: 'IN_PROGRESS',
    denial: '완료 또는 확인완료 상태에서만 재오픈할 수 있습니다.',
  },
};

const ALL_ACTIONS = Object.keys(ACTION_SPEC) as Action[];

const ALL_STAGES: SRStage[] = [
  'REQUESTED',
  'INTAKE',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CONFIRMED',
  'REJECTED',
];

/**
 * `REQUESTED → INTAKE` 는 상태 액션이 아니라 접수 라우트
 * (`POST /api/srs/[id]/intake`)가 수행한다. 22-sr-intake-process 가 덮는다.
 */
const INTAKE_ROUTE_EDGE = 'REQUESTED->INTAKE';

/** 거부되어야 할 시도에서도 필수 필드는 채워 보낸다 — 400 의 원인을 상태 하나로 좁히기 위해. */
const FULL_PAYLOAD = {
  reason: '상태 머신 매트릭스 검증',
  resolutionDescription: '상태 머신 매트릭스 검증',
};

function forbiddenActionsAt(stage: SRStage): Action[] {
  return ALL_ACTIONS.filter((action) => !ACTION_SPEC[action].from.includes(stage));
}

/** 현재 상태를 API 로 다시 읽는다. "400 인데 쓰기는 됐다" 를 잡는 관측점이다. */
async function readStatus(request: APIRequestContext, srId: string): Promise<string> {
  const response = await apiRequestWithRateLimitRetry(request, 'get', `/api/srs/${srId}`);
  expect(
    response.status(),
    `GET /api/srs/${srId} 가 200 이어야 상태를 확인할 수 있습니다. 응답: ${await response.text()}`
  ).toBe(200);
  const body = (await response.json()) as { status?: string };
  return body.status ?? '(status 필드 없음)';
}

async function patchStatus(
  request: APIRequestContext,
  srId: string,
  data: Record<string, unknown>
) {
  return apiRequestWithRateLimitRetry(request, 'patch', `/api/srs/${srId}/status`, { data });
}

async function errorOf(response: APIResponse): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `(error 필드 없음: ${await response.text().catch(() => '')})`;
}

/** 다른 페르소나 세션으로 API 를 호출한다. `request` 픽스처는 기본 storageState(ADMIN)다. */
async function withPersona<T>(
  browser: Browser,
  persona: PersonaKey,
  run: (request: APIRequestContext) => Promise<T>
): Promise<T> {
  const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES[persona] });
  try {
    return await run(context.request);
  } finally {
    await context.close();
  }
}

/** 상태별 SR 1건. 거부된 시도는 상태를 바꾸지 않으므로 한 건을 모든 금지 액션에 재사용한다. */
const seeded = new Map<SRStage, SeededSR>();

/**
 * 담당자가 ENGINEER 가 **아닌** INTAKE SR.
 * `canUpdateSR`(src/lib/policies.ts)이 ENGINEER 를 "자신에게 배정된 SR" 로 제한하는
 * 규칙을 검증하려면 담당자가 다른 사람인 SR 이 필요하다.
 */
let foreignAssigneeSR: SeededSR | undefined;

const MANAGER_EMAIL = process.env.TEST_MANAGER_ROLE_EMAIL || 'manageruser@example.com';

test.beforeAll(async ({ browser }) => {
  // SR 8건을 API 로 밀어 올린다. 기본 훅 타임아웃(60s)으로는 모자란다.
  test.setTimeout(240_000);

  for (const stage of ALL_STAGES) {
    seeded.set(stage, await seedSR(browser, { stage, title: `상태머신 매트릭스 ${stage}` }));
  }

  foreignAssigneeSR = await seedSR(browser, {
    stage: 'INTAKE',
    title: '상태머신 담당자 격리',
    assigneeEmail: MANAGER_EMAIL,
  });
});

test.afterAll(async ({ browser }) => {
  test.setTimeout(120_000);
  await deleteSeededSRs(browser, [
    ...[...seeded.values()].map((sr) => sr.id),
    foreignAssigneeSR?.id,
  ]);
});

test.describe('SR 상태 머신: 규칙이 두 곳에 있는지 대조', () => {
  test('라우트의 액션 사전조건과 VALID_TRANSITIONS 가 같은 그래프를 그린다', async () => {
    // ACTION_SPEC 은 라우트를 옮겨 적은 표이고(그 정확성은 아래 매트릭스가 API 로 검증한다),
    // VALID_TRANSITIONS 는 실제 모듈을 import 한 것이다. 둘이 같은 간선 집합이어야 한다.
    const routeEdges = ALL_ACTIONS.flatMap((action) =>
      ACTION_SPEC[action].from.map((from) => `${from}->${ACTION_SPEC[action].to}`)
    );
    const uniqueRouteEdges = [...new Set(routeEdges)].sort();

    const machineEdges = ALL_STAGES.flatMap((from) =>
      (VALID_TRANSITIONS[from] ?? []).map((to) => `${from}->${to}`)
    )
      .filter((edge) => edge !== INTAKE_ROUTE_EDGE)
      .sort();

    expect(
      uniqueRouteEdges,
      'status 라우트가 허용하는 전이 집합과 VALID_TRANSITIONS 가 갈라졌습니다. ' +
        '한쪽만 고친 변경입니다 — src/lib/sr-state-machine.ts 와 ' +
        'src/app/api/srs/[id]/status/route.ts 를 함께 보세요.'
    ).toEqual(machineEdges);

    // 종료 상태는 그래프에도 나가는 간선이 없어야 한다.
    expect(VALID_TRANSITIONS.REJECTED, 'REJECTED 는 종료 상태여야 합니다 (재요청 불가).').toEqual(
      []
    );

    // 액션이 커버하지 않는 유일한 간선은 접수 라우트가 담당하는 REQUESTED→INTAKE 뿐이다.
    expect(
      (VALID_TRANSITIONS.REQUESTED ?? []).includes('INTAKE'),
      'REQUESTED→INTAKE 가 사라지면 접수(POST /api/srs/[id]/intake) 자체가 성립하지 않습니다.'
    ).toBe(true);
  });
});

test.describe('SR 상태 머신: 금지 전이 매트릭스 (상태 × 액션)', () => {
  for (const stage of ALL_STAGES) {
    const forbidden = forbiddenActionsAt(stage);
    const label =
      stage === 'REJECTED'
        ? `REJECTED 는 종료 상태다: ${forbidden.length}개 액션 전부 거부되고 상태가 유지된다`
        : `${stage}: 금지된 액션 ${forbidden.length}개가 모두 거부되고 상태가 유지된다`;

    test(label, async ({ request }) => {
      const sr = seeded.get(stage)!;

      // arrange 가 실제로 그 상태에 도달했는지부터 확인한다.
      expect(
        await readStatus(request, sr.id),
        `픽스처가 ${sr.srNumber} 를 ${stage} 로 만들지 못했습니다. 이후 단언이 무의미해집니다.`
      ).toBe(stage);

      for (const action of forbidden) {
        const where = `${stage} 상태의 ${sr.srNumber} 에 '${action}' 액션`;

        const response = await patchStatus(request, sr.id, { action, ...FULL_PAYLOAD });

        expect(
          response.status(),
          `${where}: 4xx 로 거부되어야 합니다. 응답: ${await response.text()}`
        ).toBe(400);

        expect(await errorOf(response), `${where}: 거부 사유 문구가 라우트와 어긋납니다.`).toBe(
          ACTION_SPEC[action].denial
        );

        // 핵심 단언: 4xx 를 돌려주고도 쓰기는 일어났는가?
        expect(
          await readStatus(request, sr.id),
          `${where} 가 거부됐는데 상태가 바뀌었습니다. 라우트가 응답만 400 이고 쓰기를 막지 못했습니다.`
        ).toBe(stage);
      }
    });
  }
});

test.describe('SR 상태 머신: 액션별 필수 필드', () => {
  interface RequiredFieldCase {
    stage: SRStage;
    action: Action;
    /** 무엇이 빠졌는가 (테스트 제목·메시지용) */
    missing: string;
    /** 필수 필드를 뺀 대신 채워 보내는 값. "아무 바디나 400" 이 아님을 보이기 위해서다. */
    payload: Record<string, unknown>;
    error: string;
  }

  const cases: RequiredFieldCase[] = [
    {
      stage: 'IN_PROGRESS',
      action: 'complete',
      missing: 'resolutionDescription',
      payload: { reason: '해결 내용 대신 사유만 보냈다' },
      error: '해결 내용을 입력해주세요.',
    },
    {
      stage: 'IN_PROGRESS',
      action: 'hold',
      missing: 'reason',
      payload: { resolutionDescription: '사유 대신 해결 내용만 보냈다' },
      error: '보류 사유를 입력해주세요.',
    },
    {
      stage: 'REQUESTED',
      action: 'reject',
      missing: 'reason',
      payload: { resolutionDescription: '사유 대신 해결 내용만 보냈다' },
      error: '거절 사유를 입력해주세요.',
    },
    {
      stage: 'COMPLETED',
      action: 'reopen',
      missing: 'reason',
      payload: { resolutionDescription: '사유 대신 해결 내용만 보냈다' },
      error: '재오픈 사유를 입력해주세요.',
    },
    {
      // statusActionSchema(src/lib/schemas.ts)의 reason 은 `z.string().optional()` 이라
      // 길이 제약이 없다. 빈 문자열을 거르는 것은 라우트의 `!reason` 뿐이므로 함께 고정한다.
      stage: 'REQUESTED',
      action: 'reject',
      missing: "reason: '' (빈 문자열)",
      payload: { reason: '' },
      error: '거절 사유를 입력해주세요.',
    },
  ];

  for (const testCase of cases) {
    test(`${testCase.action}: ${testCase.missing} 없이는 400 이고 ${testCase.stage} 상태가 유지된다`, async ({
      request,
    }) => {
      const sr = seeded.get(testCase.stage)!;
      const where = `${testCase.stage} 상태의 ${sr.srNumber} 에 '${testCase.action}' (${testCase.missing} 누락)`;

      const response = await patchStatus(request, sr.id, {
        action: testCase.action,
        ...testCase.payload,
      });

      expect(
        response.status(),
        `${where}: 필수 필드가 없으면 400 이어야 합니다. 응답: ${await response.text()}`
      ).toBe(400);

      expect(await errorOf(response), `${where}: 어떤 필드가 필요한지 문구로 알려야 합니다.`).toBe(
        testCase.error
      );

      expect(await readStatus(request, sr.id), `${where} 가 거부됐는데 상태가 바뀌었습니다.`).toBe(
        testCase.stage
      );
    });
  }

  test('스키마에 없는 액션은 400 이고 상태가 유지된다', async ({ request }) => {
    const sr = seeded.get('IN_PROGRESS')!;

    // statusActionSchema.parse 가 ZodError 를 던지고 handleApiError 가 400 으로 매핑한다.
    const response = await patchStatus(request, sr.id, { action: 'archive', ...FULL_PAYLOAD });

    expect(
      response.status(),
      `알 수 없는 액션은 400 이어야 합니다. 응답: ${await response.text()}`
    ).toBe(400);

    expect(await readStatus(request, sr.id), '알 수 없는 액션이 상태를 바꿨습니다.').toBe(
      'IN_PROGRESS'
    );
  });
});

test.describe('SR 상태 머신: 권한 축', () => {
  test('confirm 은 신청자만 가능하다 — ADMIN 도 대신 확인할 수 없다', async ({ request }) => {
    const sr = seeded.get('COMPLETED')!;

    // 상태머신의 TRANSITION_ROLES 는 ADMIN 을 허용한다. 그런데 라우트는 그보다 앞서
    // requesterId 를 비교해 403 을 낸다 — 규칙이 두 곳에 있어 갈라진 지점이다.
    // 실제 계약은 라우트 쪽(더 엄격한 쪽)이며, 아래 단언이 그 사실을 박제한다.
    expect(
      TRANSITION_ROLES.COMPLETED?.CONFIRMED,
      'TRANSITION_ROLES 가 바뀌면 이 divergence 주석도 함께 갱신해야 합니다.'
    ).toContain('ADMIN');

    const response = await patchStatus(request, sr.id, { action: 'confirm' });

    expect(
      response.status(),
      `ADMIN 이 신청자(${sr.requesterEmail}) 대신 확인을 눌렀습니다. 고객 인수 게이트가 뚫렸습니다. ` +
        `응답: ${await response.text()}`
    ).toBe(403);
    expect(await errorOf(response)).toBe('신청자만 확인할 수 있습니다.');
    expect(await readStatus(request, sr.id), '거부됐는데 확인 완료로 넘어갔습니다.').toBe(
      'COMPLETED'
    );
  });

  test('confirm: 진짜 MANAGER 세션도 신청자가 아니면 403 이다', async ({ browser, request }) => {
    const sr = seeded.get('COMPLETED')!;

    // MANAGER 는 역할 경로에서도 제외돼 있고(TRANSITION_ROLES), prisma/seed.ts 가
    // SR:CONFIRM 을 주지 않으므로 권한 경로로도 우회할 수 없다.
    expect(
      TRANSITION_ROLES.COMPLETED?.CONFIRMED,
      'MANAGER 가 CONFIRMED 역할 목록에 들어가면 "확인은 고객 인수 행위" 규칙이 깨집니다.'
    ).not.toContain('MANAGER');

    const status = await withPersona(browser, 'manager', async (managerRequest) => {
      const response = await patchStatus(managerRequest, sr.id, { action: 'confirm' });
      expect(
        response.status(),
        `MANAGER 가 고객 대신 확인을 눌렀습니다. 응답: ${await response.text()}`
      ).toBe(403);
      expect(await errorOf(response)).toBe('신청자만 확인할 수 있습니다.');
      return response.status();
    });

    expect(status).toBe(403);
    expect(await readStatus(request, sr.id), 'MANAGER 의 confirm 이 상태를 바꿨습니다.').toBe(
      'COMPLETED'
    );
  });

  test('reopen: 담당 ENGINEER 는 재오픈할 수 없다 (SR:CONFIRM 이 필요하다)', async ({
    browser,
    request,
  }) => {
    const sr = seeded.get('COMPLETED')!;
    expect(sr.assigneeEmail, '이 테스트는 ENGINEER 가 담당인 SR 을 전제로 합니다.').toBeTruthy();

    // 재오픈은 SR:CONFIRM 로만 열린다. ENGINEER 는 역할에도 없고 권한도 없다.
    expect(
      TRANSITION_ROLES.COMPLETED?.IN_PROGRESS,
      'ENGINEER 가 재오픈 역할 목록에 들어가면 감사 4.3 의 회귀입니다.'
    ).not.toContain('ENGINEER');
    expect(TRANSITION_PERMISSIONS.COMPLETED?.IN_PROGRESS).toEqual(['SR:CONFIRM']);

    await withPersona(browser, 'engineer', async (engineerRequest) => {
      const response = await patchStatus(engineerRequest, sr.id, {
        action: 'reopen',
        reason: '담당 엔지니어가 재오픈을 시도한다',
      });

      // 라우트 사전조건(COMPLETED)은 통과하므로 거부는 서비스의 validateTransition 이
      // 낸다 → BusinessRuleError → 400.
      expect(
        response.status(),
        `담당 ENGINEER 가 재오픈에 성공했습니다. 응답: ${await response.text()}`
      ).toBe(400);

      const message = await errorOf(response);
      expect(message).toContain('이 상태 변경을 수행할 권한이 없습니다.');
      expect(message, '어떤 권한이 필요한지 문구에 남아야 합니다.').toContain('SR:CONFIRM');
    });

    expect(await readStatus(request, sr.id), 'ENGINEER 의 재오픈이 상태를 바꿨습니다.').toBe(
      'COMPLETED'
    );
  });

  test('start: 신청자(CLIENT_USER)는 자기 SR 이어도 진행을 시작할 수 없다', async ({
    browser,
    request,
  }) => {
    const sr = seeded.get('INTAKE')!;

    // CLIENT_USER 는 SR:UPDATE_SELF 를 가지므로 ensureCanUpdateSR 은 통과한다.
    // 막는 것은 전이 인가(TRANSITION_ROLES/TRANSITION_PERMISSIONS)뿐이다 —
    // 그래서 이 테스트가 전이 인가 자체의 회귀를 잡는다.
    expect(TRANSITION_PERMISSIONS.INTAKE?.IN_PROGRESS).toEqual(['SR:STATUS_CHANGE']);
    expect(TRANSITION_ROLES.INTAKE?.IN_PROGRESS).not.toContain('CLIENT_USER');

    await withPersona(browser, 'client', async (clientRequest) => {
      const response = await patchStatus(clientRequest, sr.id, { action: 'start' });

      expect(
        response.status(),
        `신청자가 스스로 진행 상태로 넘겼습니다. 응답: ${await response.text()}`
      ).toBe(400);

      const message = await errorOf(response);
      expect(message).toContain('이 상태 변경을 수행할 권한이 없습니다.');
      expect(message).toContain('SR:STATUS_CHANGE');
    });

    expect(await readStatus(request, sr.id), 'CLIENT_USER 의 start 가 상태를 바꿨습니다.').toBe(
      'INTAKE'
    );
  });

  test('start: 담당자가 아닌 ENGINEER 는 남의 SR 을 진행시킬 수 없다', async ({
    browser,
    request,
  }) => {
    const sr = foreignAssigneeSR!;
    expect(sr.assigneeEmail, '담당자가 ENGINEER 가 아닌 SR 이어야 합니다.').toBe(MANAGER_EMAIL);

    await withPersona(browser, 'engineer', async (engineerRequest) => {
      const response = await patchStatus(engineerRequest, sr.id, { action: 'start' });

      // canUpdateSR(src/lib/policies.ts)의 ENGINEER 분기:
      // `sr.assigneeId === user.id` 가 아니면 SR:UPDATE 를 가져도 거부 → ForbiddenError 403.
      expect(
        response.status(),
        `담당자가 아닌 ENGINEER 가 남의 SR 을 진행시켰습니다. 격리 원칙이 깨졌습니다. ` +
          `응답: ${await response.text()}`
      ).toBe(403);
      expect(await errorOf(response)).toBe('SR 수정 권한이 없습니다.');
    });

    expect(await readStatus(request, sr.id), '비담당 ENGINEER 의 start 가 상태를 바꿨습니다.').toBe(
      'INTAKE'
    );
  });
});
