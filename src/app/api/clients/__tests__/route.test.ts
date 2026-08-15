import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 고객사 목록·생성.
 *
 * 이 라우트의 계약은 **테넌트 격리**다. 외부 사용자(CLIENT_*)에게는 소속 고객사만
 * 보여야 하고, 그 술어는 서비스가 아니라 여기서 만들어진다. 술어가 빠지면 목록에
 * 전체 고객사가 뜨고 — 고객사 이름과 코드는 그 자체로 영업 정보다.
 *
 * 특히 위험한 경계는 **소속이 하나도 없는 외부 사용자**다. `where.id = { in: [] }` 가
 * 아니라 술어를 아예 걸지 않으면 "필터 없음 = 전체" 가 되어 정반대로 동작한다.
 */

const {
  mockSession,
  mockFindMany,
  mockCount,
  mockCreateClient,
  mockEnsureCanReadClient,
  mockEnsureCanCreateClient,
  mockIsInternalUser,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockSession: {
    user: { id: 'u-1', roles: ['ADMIN'], permissions: [] as string[], clientIds: [] as string[] },
  },
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockCreateClient: vi.fn(),
  mockEnsureCanReadClient: vi.fn(),
  mockEnsureCanCreateClient: vi.fn(),
  mockIsInternalUser: vi.fn(),
  mockHandleApiError: vi.fn((error: { statusCode?: number; message?: string }) =>
    NextResponse.json(
      { error: error.message ?? 'Error' },
      { status: (error as { name?: string }).name === 'ZodError' ? 400 : (error.statusCode ?? 500) }
    )
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
  ensureCanReadClient: mockEnsureCanReadClient,
  ensureCanCreateClient: mockEnsureCanCreateClient,
  isInternalUser: mockIsInternalUser,
}));

vi.mock('@/lib/prisma', () => ({
  default: { client: { findMany: mockFindMany, count: mockCount } },
}));

vi.mock('@/services/client.service', () => ({
  ClientService: class {
    createClient = mockCreateClient;
  },
}));

import { GET, POST } from '../route';

const get = (url = 'http://localhost/api/clients') => ({ url }) as never;
const post = (body: unknown) => ({ json: async () => body }) as never;

/** 이번 요청에 실제로 쓰인 where 절. */
const usedWhere = () => mockFindMany.mock.calls[0]![0].where;

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks 는 호출 기록만 지우고 **구현은 남긴다**. 한 테스트에서 정책 목을
  // "던지도록" 바꾸면 그 구현이 이후 테스트로 그대로 새어 나가, 관계없는 테스트가
  // 403 을 받는다. 매번 통과 구현으로 되돌린다.
  mockEnsureCanReadClient.mockImplementation(() => {});
  mockEnsureCanCreateClient.mockImplementation(() => {});
  mockSession.user = { id: 'u-1', roles: ['ADMIN'], permissions: [], clientIds: [] };
  mockFindMany.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
  mockIsInternalUser.mockReturnValue(true);
});

describe('GET /api/clients — 테넌트 격리', () => {
  it('내부 사용자는 고객사 필터 없이 전체를 본다', async () => {
    mockIsInternalUser.mockReturnValue(true);

    const res = await GET(get(), {} as never);

    expect(res.status).toBe(200);
    expect(usedWhere().id).toBeUndefined();
  });

  it('외부 사용자는 소속 고객사로 좁혀진다', async () => {
    mockIsInternalUser.mockReturnValue(false);
    mockSession.user = { id: 'u-2', roles: ['CLIENT_USER'], permissions: [], clientIds: ['c-1'] };

    await GET(get(), {} as never);

    expect(usedWhere().id).toEqual({ in: ['c-1'] });
  });

  // 술어를 아예 걸지 않으면 "필터 없음 = 전체" 가 되어 정반대로 동작한다.
  it('소속이 하나도 없으면 아무것도 보이지 않는다', async () => {
    mockIsInternalUser.mockReturnValue(false);
    mockSession.user = { id: 'u-3', roles: ['CLIENT_USER'], permissions: [], clientIds: [] };

    await GET(get(), {} as never);

    expect(usedWhere().id).toEqual({ in: [] });
  });

  it('조회 권한이 없으면 목록을 만들지 않는다', async () => {
    mockEnsureCanReadClient.mockImplementation(() => {
      throw Object.assign(new Error('권한이 없습니다.'), { statusCode: 403 });
    });

    const res = await GET(get(), {} as never);

    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/clients — 검색·필터', () => {
  it('검색어는 이름과 코드를 대소문자 무시로 찾는다', async () => {
    await GET(get('http://localhost/api/clients?search=abc'), {} as never);

    expect(usedWhere().OR).toEqual([
      { name: { contains: 'abc', mode: 'insensitive' } },
      { code: { contains: 'abc', mode: 'insensitive' } },
    ]);
  });

  // 외부 사용자가 검색해도 테넌트 술어는 남아 있어야 한다. 검색이 격리를 덮어쓰면
  // 이름 한 글자씩 넣어 전체 고객사를 열거할 수 있다.
  it('검색이 테넌트 술어를 덮어쓰지 않는다', async () => {
    mockIsInternalUser.mockReturnValue(false);
    mockSession.user = { id: 'u-2', roles: ['CLIENT_USER'], permissions: [], clientIds: ['c-1'] };

    await GET(get('http://localhost/api/clients?search=a'), {} as never);

    expect(usedWhere().id).toEqual({ in: ['c-1'] });
    expect(usedWhere().OR).toBeDefined();
  });

  it('지원하지 않는 활성 상태 필터는 400으로 거부한다', async () => {
    const res = await GET(get('http://localhost/api/clients?isActive=yes'), {} as never);

    expect(res.status).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it.each([
    ['search', 'a'.repeat(256)],
    ['industry', 'a'.repeat(101)],
  ])('%s 필터가 너무 길면 400으로 거부한다', async (key, value) => {
    const res = await GET(
      get(`http://localhost/api/clients?${key}=${encodeURIComponent(value)}`),
      {} as never
    );

    expect(res.status).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('all 필터는 조건을 추가하지 않는다', async () => {
    const res = await GET(
      get('http://localhost/api/clients?industry=all&isActive=all'),
      {} as never
    );

    expect(res.status).toBe(200);
    expect(usedWhere().industry).toBeUndefined();
    expect(usedWhere().isActive).toBeUndefined();
  });
});

describe('POST /api/clients', () => {
  it('생성 권한을 먼저 확인한다', async () => {
    mockEnsureCanCreateClient.mockImplementation(() => {
      throw Object.assign(new Error('권한이 없습니다.'), { statusCode: 403 });
    });

    const res = await POST(post({ name: '새 고객사' }), {} as never);

    expect(res.status).toBe(403);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('생성에 성공하면 201 을 준다', async () => {
    mockCreateClient.mockResolvedValue({ id: 'c-9', name: '새 고객사' });

    const res = await POST(post({ name: '새 고객사' }), {} as never);

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: 'c-9' });
  });
});
