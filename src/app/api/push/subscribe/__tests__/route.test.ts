import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 푸시 구독 등록/해제/상태.
 *
 * 이 라우트에서 가장 중요한 것은 **IDOR 방지**다. 구독 endpoint 는 브라우저가 만들어
 * 준 URL 이고, 그 자체로는 소유자를 증명하지 않는다. 해제 시 endpoint 만 보고 지우면
 * 남의 endpoint 를 알아낸 사람이 그 사용자의 알림을 꺼 버릴 수 있다. 그래서 서비스에
 * **반드시 세션 사용자 id 를 함께** 넘겨야 하고, 그것을 단언한다.
 *
 * 이 라우트도 `auth()` 를 직접 부르므로 인증 확인이 핸들러 안에 손으로 들어가 있다.
 * 세 메서드 각각을 확인한다 — 하나만 빠져도 그 경로가 익명에 열린다.
 */

const {
  mockAuth,
  mockParseJsonBody,
  mockSave,
  mockRemoveSubscription,
  mockRemoveUserSubscriptions,
  mockGetUserSubscriptions,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockParseJsonBody: vi.fn(),
  mockSave: vi.fn(),
  mockRemoveSubscription: vi.fn(),
  mockRemoveUserSubscriptions: vi.fn(),
  mockGetUserSubscriptions: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/api-helpers', () => ({ parseJsonBody: mockParseJsonBody }));
vi.mock('@/services/push.service', () => ({
  pushService: {
    saveSubscription: mockSave,
    removeSubscription: mockRemoveSubscription,
    removeUserSubscriptions: mockRemoveUserSubscriptions,
    getUserSubscriptions: mockGetUserSubscriptions,
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { DELETE, GET, POST } from '../route';

const VALID = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'key', auth: 'auth' },
};

/** POST 요청 대역. user-agent 헤더를 갖는다. */
const postReq = (ua: string | null = 'Chrome/1.0') => ({ headers: { get: () => ua } }) as never;

/** DELETE 요청 대역. 쿼리스트링만 쓴다. */
const delReq = (qs = '') => ({ url: `http://localhost/api/push/subscribe${qs}` }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'u-1' } });
  mockParseJsonBody.mockResolvedValue(VALID);
  mockGetUserSubscriptions.mockResolvedValue([]);
});

describe('POST /api/push/subscribe', () => {
  it('구독을 저장하고 201 을 준다', async () => {
    const res = await POST(postReq());

    expect(res.status).toBe(201);
    // 소유자는 세션에서 온다. 본문의 값이 아니다.
    expect(mockSave).toHaveBeenCalledWith('u-1', VALID, 'Chrome/1.0');
  });

  it('user-agent 가 없어도 저장한다', async () => {
    const res = await POST(postReq(null));

    expect(res.status).toBe(201);
    expect(mockSave).toHaveBeenCalledWith('u-1', VALID, undefined);
  });

  it('세션이 없으면 401 이고 본문을 읽지도 않는다', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST(postReq());

    expect(res.status).toBe(401);
    expect(mockParseJsonBody).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  // 형태가 깨진 구독을 저장하면 발송 시점에야 실패하고, 그때는 원인을 추적하기 어렵다.
  it('구독 형태가 맞지 않으면 400 으로 막는다', async () => {
    mockParseJsonBody.mockResolvedValue({ endpoint: 'not-a-url', keys: {} });

    const res = await POST(postReq());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.details).toBeDefined();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('저장이 실패하면 500 과 일반 문구만 준다', async () => {
    mockSave.mockRejectedValue(new Error('unique constraint push_subscriptions_endpoint_key'));

    const res = await POST(postReq());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('constraint');
  });
});

describe('DELETE /api/push/subscribe', () => {
  // 이것이 이 라우트에서 가장 중요한 단언이다. endpoint 만 보고 지우면 남의 알림을
  // 끌 수 있다(IDOR).
  it('특정 endpoint 해제는 소유자 id 와 함께 지운다', async () => {
    const res = await DELETE(delReq('?endpoint=https://fcm.example/abc'));

    expect(res.status).toBe(200);
    expect(mockRemoveSubscription).toHaveBeenCalledWith('https://fcm.example/abc', 'u-1');
    expect(mockRemoveUserSubscriptions).not.toHaveBeenCalled();
  });

  it('endpoint 가 없으면 본인 구독 전체를 해제한다', async () => {
    const res = await DELETE(delReq());

    expect(res.status).toBe(200);
    expect(mockRemoveUserSubscriptions).toHaveBeenCalledWith('u-1');
    expect(mockRemoveSubscription).not.toHaveBeenCalled();
  });

  it('세션이 없으면 401 이고 아무것도 지우지 않는다', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await DELETE(delReq('?endpoint=https://fcm.example/abc'));

    expect(res.status).toBe(401);
    expect(mockRemoveSubscription).not.toHaveBeenCalled();
    expect(mockRemoveUserSubscriptions).not.toHaveBeenCalled();
  });

  it('해제가 실패하면 500 을 준다', async () => {
    mockRemoveUserSubscriptions.mockRejectedValue(new Error('db down'));

    const res = await DELETE(delReq());

    expect(res.status).toBe(500);
  });
});

describe('GET /api/push/subscribe', () => {
  it('구독이 있으면 isSubscribed 가 참이다', async () => {
    mockGetUserSubscriptions.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ isSubscribed: true, subscriptionCount: 2 });
    expect(mockGetUserSubscriptions).toHaveBeenCalledWith('u-1');
  });

  it('구독이 없으면 isSubscribed 가 거짓이다', async () => {
    mockGetUserSubscriptions.mockResolvedValue([]);

    const res = await GET();

    expect(await res.json()).toEqual({ isSubscribed: false, subscriptionCount: 0 });
  });

  it('세션이 없으면 401', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(mockGetUserSubscriptions).not.toHaveBeenCalled();
  });
});
