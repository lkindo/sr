import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 알림 설정.
 *
 * **2026-08-15 변경**: 이 라우트는 이제 `withAuthAndRateLimit` 을 경유한다(감사 D-11).
 * 예전에는 `auth()` 를 직접 부르고 광역 try/catch 로 모든 오류를 500 으로 뭉갰다 —
 * 스키마 위반(400)까지 500 이 됐고, 레이트리밋도 성능 계측도 걸리지 않았다.
 * 인증 거부와 오류→상태코드 매핑은 이제 래퍼의 책임이므로, 여기서는 래퍼를 통과한
 * 결과만 단언한다(래퍼 자체는 `auth-wrapper` 테스트가 덮는다).
 *
 * 유지되는 계약: 설정 대상은 **언제나 세션 사용자 본인**이다. 본문에서 userId 를 받지
 * 않는 것이 곧 계약이라, 서비스에 넘기는 id 가 세션에서 온 값인지 확인한다.
 */

const { mockAuth, mockGetOrCreate, mockUpdate, mockParseJsonBody } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetOrCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockParseJsonBody: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/api-helpers', () => ({ parseJsonBody: mockParseJsonBody }));
vi.mock('@/services/push.service', () => ({
  pushService: { getOrCreatePreferences: mockGetOrCreate, updatePreferences: mockUpdate },
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    logError: vi.fn(),
    logRequest: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { GET, PUT } from '../route';

const PREFS = { emailSRCreated: true, pushSRAssigned: false };

/** 래퍼가 (request, { params }) 를 받으므로 최소 형태를 만들어 준다. */
const req = () => new Request('http://localhost/api/settings/notifications') as never;
const ctx = () => ({ params: Promise.resolve({}) }) as never;
const callGet = () => (GET as never as (r: never, c: never) => Promise<Response>)(req(), ctx());
const callPut = () => (PUT as never as (r: never, c: never) => Promise<Response>)(req(), ctx());

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'u-1' } });
  mockGetOrCreate.mockResolvedValue(PREFS);
  mockUpdate.mockResolvedValue(PREFS);
  mockParseJsonBody.mockResolvedValue({ emailSRCreated: true });
});

describe('GET /api/settings/notifications', () => {
  it('세션 사용자의 설정을 돌려준다', async () => {
    const res = await callGet();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PREFS);
    // 본문이 아니라 세션에서 온 id 여야 남의 설정을 읽을 수 없다.
    expect(mockGetOrCreate).toHaveBeenCalledWith('u-1');
  });

  it('세션이 없으면 401', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await callGet();

    expect(res.status).toBe(401);
    expect(mockGetOrCreate).not.toHaveBeenCalled();
  });

  it('세션에 사용자 id 가 없어도 401', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const res = await callGet();

    expect(res.status).toBe(401);
  });

  // 유출 방지 자체는 `handleApiError` 의 책임이고 프로덕션 분기라
  // `api-error-handler.leak.test.ts` 가 고정한다. 여기서 지키는 것은 **위임** 이다 —
  // 라우트가 자체 catch 로 500 을 만들면 그 중앙 통제를 우회하게 된다.
  it('조회가 실패하면 handleApiError 에 위임한다', async () => {
    mockGetOrCreate.mockRejectedValue(new Error('column "push_sr_created" does not exist'));

    const res = await callGet();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

describe('PUT /api/settings/notifications', () => {
  it('설정을 저장한다', async () => {
    const res = await callPut();

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('u-1', { emailSRCreated: true });
  });

  it('세션이 없으면 401 이고 본문을 읽지도 않는다', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await callPut();

    expect(res.status).toBe(401);
    expect(mockParseJsonBody).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // 스키마에 없는 키나 잘못된 타입이 그대로 저장되면, 이후 조회에서 조용히 무시되어
  // "저장했는데 반영이 안 된다" 로 나타난다.
  it('스키마에 맞지 않으면 400 으로 막는다', async () => {
    mockParseJsonBody.mockResolvedValue({ emailSRCreated: '예' });

    const res = await callPut();
    const body = await res.json();

    // 예전에는 safeParse 결과를 직접 400 으로 만들었다. 이제는 ZodError 를 던지고
    // handleApiError 가 400 으로 옮긴다 — 상태 코드가 계약이고 본문 형태는 그쪽 소관이다.
    expect(res.status).toBe(400);
    expect(body).toBeDefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('일부 필드만 보내도 저장된다', async () => {
    mockParseJsonBody.mockResolvedValue({ pushCommentAdded: true });

    const res = await callPut();

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('u-1', { pushCommentAdded: true });
  });

  it('저장이 실패하면 handleApiError 에 위임한다', async () => {
    mockUpdate.mockRejectedValue(new Error('deadlock detected on relation notification_prefs'));

    const res = await callPut();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
