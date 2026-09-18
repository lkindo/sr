import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 로그 조회 (ADMIN 전용, 2026-09-18 소유자 결정 D11).
 *
 *  1. ADMIN 이 아니면 막힌다 — 전 고객사의 관리 행위와 변경 전후 값(이메일 등)이 담겨 테넌트로 나눌 수 없다.
 *  2. 조건을 서비스에 그대로 넘기고, 기간은 한국 시간 달력일로 해석한다(끝 날짜는 그날 하루를 포함).
 *  3. 잘못된 날짜 형식은 400 이다.
 */

const { mockSession, mockListLogs } = vi.hoisted(() => ({
  mockSession: {
    user: { id: 'admin-1', roles: ['ADMIN'] as string[], permissions: [] as string[] },
  },
  mockListLogs: vi.fn(),
}));

vi.mock('@/services/audit.service', () => ({ auditService: { listLogs: mockListLogs } }));
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

import { GET } from '../route';

const call = (query = '') =>
  (GET as never as (r: Request, c: unknown) => Promise<Response>)(
    new Request(`http://localhost/api/audit-logs${query}`),
    { params: Promise.resolve({}) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.user.roles = ['ADMIN'];
  mockListLogs.mockResolvedValue({
    rows: [{ id: 'a-1', actionType: 'APPROVE', user: null }],
    total: 1,
    facets: { actionTypes: ['APPROVE'], targetEntities: ['UserClient'] },
  });
});

describe('GET /api/audit-logs', () => {
  it.each([['MANAGER'], ['ENGINEER'], ['CLIENT_ADMIN']])('%s 는 조회할 수 없다', async (role) => {
    mockSession.user.roles = [role];

    const res = await call();

    expect(res.status).toBe(403);
    expect(mockListLogs).not.toHaveBeenCalled();
  });

  it('ADMIN 은 조건을 넘겨 조회하고, 페이지 정보와 필터 선택지를 받는다', async () => {
    const res = await call(
      '?actionType=APPROVE&targetEntity=UserClient&actor=%20kim%20&page=2&pageSize=10'
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockListLogs).toHaveBeenCalledWith(
      {
        actionType: 'APPROVE',
        targetEntity: 'UserClient',
        targetId: undefined,
        actor: 'kim',
        from: undefined,
        to: undefined,
      },
      { skip: 10, take: 10 }
    );
    expect(body.data).toHaveLength(1);
    expect(body.meta.totalItems).toBe(1);
    expect(body.facets.actionTypes).toEqual(['APPROVE']);
  });

  it('기간은 한국 시간 달력일로 해석하고 끝 날짜는 그날 하루를 포함한다', async () => {
    await call('?from=2026-09-01&to=2026-09-18');

    const [filter] = mockListLogs.mock.calls[0]!;
    expect(filter.from.toISOString()).toBe('2026-08-31T15:00:00.000Z'); // 9/1 00:00 KST
    expect(filter.to.toISOString()).toBe('2026-09-18T15:00:00.000Z'); // 9/19 00:00 KST(제외)
  });

  it('날짜 형식이 틀리면 400 이다', async () => {
    const res = await call('?from=2026/09/01');

    expect(res.status).toBe(400);
    expect(mockListLogs).not.toHaveBeenCalled();
  });
});
