import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SR 활동 이력 조회.
 *
 * 활동 이력에는 담당자 이름·이메일과 상태 변경 사유가 그대로 들어 있다. 즉 **SR 본문을
 * 못 보는 사람이 이력만으로 상당 부분을 재구성할 수 있다.** 그래서 이 라우트는
 * 이력을 읽기 전에 **부모 SR 에 대한 읽기 권한**을 먼저 판정해야 한다.
 *
 * 판정 순서가 뒤집히면(이력을 먼저 조회하고 인가를 나중에 하면) 실제로 유출되지는
 * 않더라도 남의 SR id 로 쿼리가 나가고, 무엇보다 다음 사람이 순서를 바꾸기 쉬워진다.
 * 여기서는 **거부 시 sRActivity 조회 자체가 없었는지**를 단언한다.
 */

const {
  mockSession,
  mockSRFindUnique,
  mockActivityFindMany,
  mockEnsureCanReadSR,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockSession: { user: { id: 'u-1', roles: ['CLIENT_USER'], permissions: [], clientIds: ['c-1'] } },
  mockSRFindUnique: vi.fn(),
  mockActivityFindMany: vi.fn(),
  mockEnsureCanReadSR: vi.fn(),
  mockHandleApiError: vi.fn((error: { statusCode?: number; message?: string }) =>
    NextResponse.json({ error: error.message ?? 'Error' }, { status: error.statusCode ?? 500 })
  ),
}));

vi.mock('@/lib/api-error-handler', () => ({ handleApiError: mockHandleApiError }));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit:
    (handler: (req: unknown, ctx: unknown) => Promise<Response>) =>
    async (req: unknown, ctx: Record<string, unknown>) => {
      try {
        return await handler(req, { ...ctx, session: mockSession });
      } catch (error) {
        return mockHandleApiError(error as never);
      }
    },
}));

vi.mock('@/lib/policies', () => ({ ensureCanReadSR: mockEnsureCanReadSR }));

vi.mock('@/lib/prisma', () => ({
  default: {
    sR: { findUnique: mockSRFindUnique },
    sRActivity: { findMany: mockActivityFindMany },
  },
}));

import { GET } from '../route';

const context = { params: Promise.resolve({ id: 'sr-1' }) } as never;
const SR = { id: 'sr-1', clientId: 'c-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockEnsureCanReadSR.mockImplementation(() => {});
  mockSRFindUnique.mockResolvedValue(SR);
  mockActivityFindMany.mockResolvedValue([{ id: 'a-1' }]);
});

describe('GET /api/srs/[id]/activities', () => {
  it('부모 SR 권한을 확인한 뒤 이력을 준다', async () => {
    const res = await GET({} as never, context);

    expect(res.status).toBe(200);
    expect(mockEnsureCanReadSR).toHaveBeenCalledWith(mockSession.user, SR);
    expect(await res.json()).toEqual([{ id: 'a-1' }]);
  });

  it('없는 SR 이면 404 이고 이력을 조회하지 않는다', async () => {
    mockSRFindUnique.mockResolvedValue(null);

    const res = await GET({} as never, context);

    expect(res.status).toBe(404);
    expect(mockActivityFindMany).not.toHaveBeenCalled();
  });

  // 이력에는 담당자 정보와 변경 사유가 들어 있다. 거부되면 쿼리 자체가 나가면 안 된다.
  it('읽기 권한이 없으면 이력 조회 자체를 하지 않는다', async () => {
    mockEnsureCanReadSR.mockImplementation(() => {
      throw Object.assign(new Error('접근 권한이 없습니다.'), { statusCode: 403 });
    });

    const res = await GET({} as never, context);

    expect(res.status).toBe(403);
    expect(mockActivityFindMany).not.toHaveBeenCalled();
  });

  it('최신순으로 정렬해 조회한다', async () => {
    await GET({} as never, context);

    // 이력은 시간순 서사다. 정렬이 없으면 Postgres 가 순서를 보장하지 않아
    // 배포마다 다른 순서로 보인다.
    expect(mockActivityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { srId: 'sr-1' },
        orderBy: { createdAt: 'desc' },
      })
    );
  });

  it('이력이 없으면 빈 목록을 준다', async () => {
    mockActivityFindMany.mockResolvedValue([]);

    const res = await GET({} as never, context);

    // 빈 배열은 정상이다. 404 로 만들면 화면이 "SR 이 없다" 로 오해한다.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
