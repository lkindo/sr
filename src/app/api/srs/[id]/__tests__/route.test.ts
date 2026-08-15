import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SR 상세 라우트.
 *
 * 여기서 가장 중요한 것은 **조회 순서**다. 이 라우트는 SR 을 먼저 가져온 뒤에
 * `ensureCanReadSR` 로 인가를 판정한다. 그래서 "없는 SR" 과 "볼 수 없는 SR" 의 응답이
 * 서로 달라지면, 남의 테넌트에 어떤 id 가 존재하는지 열거할 수 있게 된다.
 * 그 경계를 단언한다.
 *
 * PATCH·DELETE 는 인가를 서비스 계층에 위임한다(요청자 본인/ADMIN 판정이 상태에 따라
 * 달라져서, 라우트가 흉내 내면 두 곳이 어긋난다). 라우트의 계약은 **세션 사용자를
 * 빠짐없이 서비스로 넘기는 것** 하나다 — 빠뜨리면 서비스가 인가를 판정할 수 없다.
 */

const {
  mockSession,
  mockGetSRDetailsById,
  mockUpdateSR,
  mockDeleteSR,
  mockEnsureCanReadSR,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockSession: { user: { id: 'u-1', roles: ['MANAGER'], permissions: [], clientIds: [] } },
  mockGetSRDetailsById: vi.fn(),
  mockUpdateSR: vi.fn(),
  mockDeleteSR: vi.fn(),
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

vi.mock('@/lib/api-helpers', () => ({
  validateRequestBody: async (request: { json: () => Promise<unknown> }) => request.json(),
}));

vi.mock('@/lib/policies', () => ({
  ensureCanReadSR: mockEnsureCanReadSR,
  isInternalUser: (user: { roles?: string[] }) =>
    user.roles?.some((role) => ['ADMIN', 'MANAGER', 'ENGINEER'].includes(role)) ?? false,
}));

vi.mock('@/services/sr.service', () => ({
  srService: {
    getSRDetailsById: mockGetSRDetailsById,
    updateSR: mockUpdateSR,
    deleteSR: mockDeleteSR,
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    logError: vi.fn(),
    logRequest: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { DELETE, GET, PATCH } from '../route';

const context = { params: Promise.resolve({ id: 'sr-1' }) } as never;
const req = (body: unknown = {}) => ({ json: async () => body }) as never;

const SR = { id: 'sr-1', srNumber: 'SR-0001', clientId: 'c-1', attachments: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSRDetailsById.mockResolvedValue(SR);
});

describe('GET /api/srs/[id]', () => {
  it('조회한 SR 에 대해 인가를 판정한다', async () => {
    const res = await GET(req(), context);

    expect(res.status).toBe(200);
    // 세션 사용자와 **조회된 행**을 함께 넘겨야 테넌트 술어를 판정할 수 있다.
    expect(mockEnsureCanReadSR).toHaveBeenCalledWith(mockSession.user, SR);
    expect(mockGetSRDetailsById).toHaveBeenCalledWith('sr-1', { viewer: mockSession.user });
  });

  it('없는 SR 은 404', async () => {
    mockGetSRDetailsById.mockResolvedValue(null);

    const res = await GET(req(), context);

    expect(res.status).toBe(404);
    // 존재하지 않으면 인가를 판정할 대상 자체가 없다.
    expect(mockEnsureCanReadSR).not.toHaveBeenCalled();
  });

  // 남의 테넌트 SR 을 "없음" 이 아니라 "금지" 로 알려 주면 id 존재 여부가 새어 나가지만,
  // 그 판정은 정책 계층의 몫이다. 라우트는 정책이 던진 것을 그대로 응답으로 옮긴다.
  it('정책이 거부하면 응답도 거부가 된다', async () => {
    mockEnsureCanReadSR.mockImplementation(() => {
      throw Object.assign(new Error('접근 권한이 없습니다.'), { statusCode: 403 });
    });

    const res = await GET(req(), context);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/srs/[id]', () => {
  it('세션 사용자를 서비스로 넘긴다', async () => {
    mockUpdateSR.mockResolvedValue(SR);

    const res = await PATCH(req({ title: '새 제목' }), context);

    expect(res.status).toBe(200);
    // 이 인자가 빠지면 서비스가 인가를 판정할 수 없어 누구나 수정하게 된다.
    expect(mockUpdateSR).toHaveBeenCalledWith('sr-1', { title: '새 제목' }, mockSession.user);
  });

  it('서비스가 거부하면 그대로 전달한다', async () => {
    mockUpdateSR.mockRejectedValue(
      Object.assign(new Error('수정 권한이 없습니다.'), { statusCode: 403 })
    );

    const res = await PATCH(req({ title: 'x' }), context);

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/srs/[id]', () => {
  it('세션 사용자를 넘기고 본문 있는 응답을 준다', async () => {
    mockDeleteSR.mockResolvedValue(undefined);

    const res = await DELETE(req(), context);
    const body = await res.json();

    expect(mockDeleteSR).toHaveBeenCalledWith('sr-1', mockSession.user);
    // deleteSR 은 void 다. undefined 를 그대로 넘기면 JSON 직렬화가 깨져 500 이 난다.
    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, message: 'SR이 삭제되었습니다.' });
  });

  it('서비스가 거부하면 그대로 전달한다', async () => {
    mockDeleteSR.mockRejectedValue(
      Object.assign(new Error('삭제 권한이 없습니다.'), { statusCode: 403 })
    );

    const res = await DELETE(req(), context);

    expect(res.status).toBe(403);
  });
});
