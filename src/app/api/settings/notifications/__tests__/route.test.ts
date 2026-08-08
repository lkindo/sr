import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 알림 설정.
 *
 * 이 라우트는 `withAuthAndRateLimit` 을 쓰지 않고 `auth()` 를 직접 부른다. 그래서
 * **인증 확인이 핸들러 안에 손으로 들어가 있고**, 빠뜨리면 익명 요청이 그대로 통과한다.
 * 다른 라우트처럼 래퍼가 대신 막아 주지 않으므로 두 메서드 각각을 단언한다.
 *
 * 또 하나: 설정 대상은 **언제나 세션 사용자 본인**이다. 본문에서 userId 를 받지 않는
 * 것이 곧 계약이라, 서비스에 넘기는 id 가 세션에서 온 값인지 확인한다.
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
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { GET, PUT } from '../route';

const PREFS = { emailSRCreated: true, pushSRAssigned: false };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'u-1' } });
  mockGetOrCreate.mockResolvedValue(PREFS);
  mockUpdate.mockResolvedValue(PREFS);
  mockParseJsonBody.mockResolvedValue({ emailSRCreated: true });
});

describe('GET /api/settings/notifications', () => {
  it('세션 사용자의 설정을 돌려준다', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PREFS);
    // 본문이 아니라 세션에서 온 id 여야 남의 설정을 읽을 수 없다.
    expect(mockGetOrCreate).toHaveBeenCalledWith('u-1');
  });

  it('세션이 없으면 401', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(mockGetOrCreate).not.toHaveBeenCalled();
  });

  it('세션에 사용자 id 가 없어도 401', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('조회가 실패하면 500 과 일반 문구만 준다', async () => {
    mockGetOrCreate.mockRejectedValue(new Error('column "push_sr_created" does not exist'));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('column');
  });
});

describe('PUT /api/settings/notifications', () => {
  it('설정을 저장한다', async () => {
    const res = await PUT({} as never);

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('u-1', { emailSRCreated: true });
  });

  it('세션이 없으면 401 이고 본문을 읽지도 않는다', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await PUT({} as never);

    expect(res.status).toBe(401);
    expect(mockParseJsonBody).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // 스키마에 없는 키나 잘못된 타입이 그대로 저장되면, 이후 조회에서 조용히 무시되어
  // "저장했는데 반영이 안 된다" 로 나타난다.
  it('스키마에 맞지 않으면 400 으로 막는다', async () => {
    mockParseJsonBody.mockResolvedValue({ emailSRCreated: '예' });

    const res = await PUT({} as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.details).toBeDefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('일부 필드만 보내도 저장된다', async () => {
    mockParseJsonBody.mockResolvedValue({ pushCommentAdded: true });

    const res = await PUT({} as never);

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('u-1', { pushCommentAdded: true });
  });

  it('저장이 실패하면 500 과 일반 문구만 준다', async () => {
    mockUpdate.mockRejectedValue(new Error('deadlock detected on relation notification_prefs'));

    const res = await PUT({} as never);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('deadlock');
  });
});
