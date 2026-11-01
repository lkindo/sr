import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockGetUserSubscriptions, mockSendToUser } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetUserSubscriptions: vi.fn(),
  mockSendToUser: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/services/push.service', () => ({
  pushService: {
    getUserSubscriptions: mockGetUserSubscriptions,
    sendToUser: mockSendToUser,
  },
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

import { POST } from '../route';

type Route = (r: never, c: never) => Promise<Response>;
const callPost = () =>
  (POST as never as Route)(
    new Request('http://localhost/api/push/test', { method: 'POST' }) as never,
    { params: Promise.resolve({}) } as never
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'u-1' } });
  mockGetUserSubscriptions.mockResolvedValue([{ id: 's-1' }, { id: 's-2' }]);
  mockSendToUser.mockResolvedValue([{ statusCode: 201, body: 'upstream response body' }]);
});

describe('POST /api/push/test', () => {
  // 응답 본문을 돌려주면 호출 대상의 응답을 읽어 가는 통로가 된다.
  it('푸시 서비스의 응답 본문은 돌려주지 않고 건수만 알린다', async () => {
    const res = await callPost();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, count: 2, delivered: 1 });
  });

  it('구독이 없으면 404 이고 발송하지 않는다', async () => {
    mockGetUserSubscriptions.mockResolvedValue([]);

    const res = await callPost();

    expect(res.status).toBe(404);
    expect(mockSendToUser).not.toHaveBeenCalled();
  });
});
