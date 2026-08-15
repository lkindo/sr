import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 알림 아웃박스 조회·재발송 (ADMIN 전용).
 *
 * 헌법 §4.1 은 실패한 알림이 **조회 가능하고 재발송 가능**해야 한다고 규정한다.
 * 이 스위트가 지키는 것은 세 가지다.
 *
 *  1. ADMIN 이 아니면 막힌다. 전 고객사의 수신자 이메일이 담긴 목록이라 테넌트 개념이 없다.
 *  2. 응답에 **본문(`content`)이 실리지 않는다.** 운영자가 알아야 할 것은 "무엇이 왜
 *     실패했는가" 지 수신자에게 간 메일 본문이 아니다.
 *  3. 재발송은 `FAILED` 만 되살린다. `SENT` 를 되살리면 같은 메일이 한 번 더 간다.
 */

const { mockSession, mockFindMany, mockCount, mockGroupBy, mockUpdateMany, mockParseJsonBody } =
  vi.hoisted(() => ({
    mockSession: { user: { id: 'admin-1', roles: ['ADMIN'] as string[] } },
    mockFindMany: vi.fn(),
    mockCount: vi.fn(),
    mockGroupBy: vi.fn(),
    mockUpdateMany: vi.fn(),
    mockParseJsonBody: vi.fn(),
  }));

vi.mock('@/lib/prisma', () => ({
  default: {
    notification: {
      findMany: mockFindMany,
      count: mockCount,
      groupBy: mockGroupBy,
      updateMany: mockUpdateMany,
    },
  },
}));

vi.mock('@/lib/api-helpers', () => ({ parseJsonBody: mockParseJsonBody }));
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    logRequest: vi.fn(),
    logError: vi.fn(),
  },
}));

// 래퍼는 인증·레이트리밋을 담당한다. 여기 관심사는 라우트의 인가·계약이다.
// **오류→상태코드 매핑은 실물 `handleApiError` 를 쓴다** — ZodError 가 400 으로
// 매핑되는 것 자체가 이 라우트 계약의 일부이고, 목으로 흉내 내면 그 검증이 사라진다.
vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit:
    (handler: (req: unknown, ctx: unknown) => Promise<Response>) =>
    async (req: unknown, ctx: Record<string, unknown>) => {
      const { handleApiError } = await import('@/lib/api-error-handler');
      try {
        return await handler(req, { ...ctx, session: mockSession });
      } catch (error) {
        return handleApiError(error);
      }
    },
}));

import { GET, POST } from '../route';

const ctx = { params: Promise.resolve({}) } as never;
const getReq = (qs = '') => new Request(`http://localhost/api/notifications/outbox${qs}`) as never;
const postReq = () => new Request('http://localhost/api/notifications/outbox') as never;

const ROW = {
  id: 'n-1',
  type: 'EMAIL',
  status: 'FAILED',
  recipient: 'user@example.com',
  subject: '[SR System] 완료',
  attempts: 5,
  failReason: 'SMTP 자격증명이 설정되지 않았습니다',
  nextAttemptAt: null,
  sentAt: null,
  createdAt: new Date('2026-08-15T00:00:00Z'),
  metadata: { srId: 'sr-1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.user = { id: 'admin-1', roles: ['ADMIN'] };
  mockFindMany.mockResolvedValue([ROW]);
  mockCount.mockResolvedValue(1);
  mockGroupBy.mockResolvedValue([
    { status: 'FAILED', _count: { _all: 1 } },
    { status: 'SENT', _count: { _all: 7 } },
  ]);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockParseJsonBody.mockResolvedValue({ ids: ['n-1'] });
});

describe('GET /api/notifications/outbox', () => {
  it('ADMIN 이 아니면 거부한다', async () => {
    mockSession.user = { id: 'mgr-1', roles: ['MANAGER'] };

    const res = await (GET as never as (r: never, c: never) => Promise<Response>)(getReq(), ctx);

    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('상태별 건수를 함께 돌려준다', async () => {
    const res = await (GET as never as (r: never, c: never) => Promise<Response>)(getReq(), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stats).toEqual({ pending: 0, sent: 7, failed: 1 });
  });

  it('본문(content)은 select 에 넣지 않는다', async () => {
    await (GET as never as (r: never, c: never) => Promise<Response>)(getReq(), ctx);

    const select = mockFindMany.mock.calls[0]![0].select;
    // 알림 본문에는 SR 제목과 수신자 정보가 들어 있다. 조회 화면에 필요하지 않다.
    expect(select).not.toHaveProperty('content');
    expect(select.failReason).toBe(true);
  });

  it('상태 필터를 where 에 반영한다', async () => {
    await (GET as never as (r: never, c: never) => Promise<Response>)(
      getReq('?status=FAILED'),
      ctx
    );

    expect(mockFindMany.mock.calls[0]![0].where).toEqual({ status: 'FAILED' });
  });
});

describe('POST /api/notifications/outbox — 재발송', () => {
  it('ADMIN 이 아니면 거부한다', async () => {
    mockSession.user = { id: 'mgr-1', roles: ['MANAGER'] };

    const res = await (POST as never as (r: never, c: never) => Promise<Response>)(postReq(), ctx);

    expect(res.status).toBe(403);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  /**
   * 이것이 이 라우트에서 가장 중요한 단언이다.
   * `SENT` 를 되살리면 수신자에게 같은 메일이 한 번 더 간다.
   */
  it('FAILED 인 행만 되살린다', async () => {
    await (POST as never as (r: never, c: never) => Promise<Response>)(postReq(), ctx);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n-1'] }, status: 'FAILED' },
      data: { status: 'PENDING', attempts: 0, failReason: null, nextAttemptAt: null },
    });
  });

  it('attempts 를 0 으로 되돌려 백오프가 처음부터 세게 한다', async () => {
    await (POST as never as (r: never, c: never) => Promise<Response>)(postReq(), ctx);

    // 리셋하지 않으면 이미 5회를 쓴 행이 곧바로 상한에 걸려 다시 FAILED 가 된다.
    expect(mockUpdateMany.mock.calls[0]![0].data.attempts).toBe(0);
  });

  it('요청 수와 실제 되살린 수가 다르면 skipped 로 알려 준다', async () => {
    mockParseJsonBody.mockResolvedValue({ ids: ['n-1', 'n-2', 'n-3'] });
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const res = await (POST as never as (r: never, c: never) => Promise<Response>)(postReq(), ctx);
    const body = await res.json();

    expect(body.requeued).toBe(1);
    expect(body.skipped).toBe(2);
  });

  it('빈 목록은 400 으로 막는다', async () => {
    mockParseJsonBody.mockResolvedValue({ ids: [] });

    const res = await (POST as never as (r: never, c: never) => Promise<Response>)(postReq(), ctx);

    expect(res.status).toBe(400);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('한 번에 되살릴 수 있는 건수를 제한한다', async () => {
    // 실수로 전량을 재발송하면 수신자에게 대량 메일이 나간다.
    mockParseJsonBody.mockResolvedValue({ ids: Array.from({ length: 101 }, (_, i) => `n-${i}`) });

    const res = await (POST as never as (r: never, c: never) => Promise<Response>)(postReq(), ctx);

    expect(res.status).toBe(400);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
