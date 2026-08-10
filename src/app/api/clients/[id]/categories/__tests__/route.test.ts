import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 고객사별 서비스 카테고리.
 *
 * 권한이 **두 겹**이다. `ensureCanUpdateClient` 는 "카테고리를 만들 수 있는 사람인가"
 * 만 보고, 어느 고객사인지는 보지 않는다. 그래서 외부 사용자에 대해서는 URL 의 고객사
 * id 가 본인 소속인지 따로 대조한다. 이 대조가 빠지면 `CLIENT_ADMIN` 이 남의 고객사에
 * 카테고리를 만들 수 있고, 카테고리는 SLA·담당자와 묶여 있어 그대로 운영에 영향을 준다.
 *
 * 또 하나: `clientId` 는 **본문이 아니라 URL 에서** 온다. 본문 값을 신뢰하면 경로는
 * 자기 고객사로 두고 본문만 바꿔 우회할 수 있다.
 */

const {
  mockSession,
  mockClientFindUnique,
  mockGetByClientId,
  mockCreate,
  mockParseJsonBody,
  mockEnsureCanReadClient,
  mockEnsureCanUpdateClient,
  mockIsInternalUser,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockSession: {
    user: { id: 'u-1', roles: ['ADMIN'] as string[], permissions: [], clientIds: [] as string[] },
  },
  mockClientFindUnique: vi.fn(),
  mockGetByClientId: vi.fn(),
  mockCreate: vi.fn(),
  mockParseJsonBody: vi.fn(),
  mockEnsureCanReadClient: vi.fn(),
  mockEnsureCanUpdateClient: vi.fn(),
  mockIsInternalUser: vi.fn(),
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

vi.mock('@/lib/api-helpers', () => ({ parseJsonBody: mockParseJsonBody }));

vi.mock('@/lib/policies', () => ({
  ensureCanReadClient: mockEnsureCanReadClient,
  ensureCanUpdateClient: mockEnsureCanUpdateClient,
  isInternalUser: mockIsInternalUser,
}));

vi.mock('@/lib/prisma', () => ({ default: { client: { findUnique: mockClientFindUnique } } }));

vi.mock('@/services/service-category.service', () => ({
  serviceCategoryService: { getByClientId: mockGetByClientId, create: mockCreate },
}));

import { GET, POST } from '../route';

const context = { params: Promise.resolve({ id: 'c-1' }) } as never;
const req = () => ({ json: async () => ({}) }) as never;

const CLIENT = { id: 'c-1', name: '테스트 고객사 A' };

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.user = { id: 'u-1', roles: ['ADMIN'], permissions: [], clientIds: [] };
  mockClientFindUnique.mockResolvedValue(CLIENT);
  mockGetByClientId.mockResolvedValue([{ id: 'cat-1' }]);
  mockCreate.mockResolvedValue({ id: 'cat-9' });
  mockParseJsonBody.mockResolvedValue({ categoryName: '신규 카테고리', slaHours: 24 });
  mockEnsureCanReadClient.mockImplementation(() => {});
  mockEnsureCanUpdateClient.mockImplementation(() => {});
  mockIsInternalUser.mockReturnValue(true);
});

describe('GET /api/clients/[id]/categories', () => {
  it('고객사를 확인한 뒤 카테고리를 준다', async () => {
    const res = await GET({} as never, context);

    expect(res.status).toBe(200);
    // 정책이 고객사 행을 받아야 테넌트 술어를 판정할 수 있다.
    expect(mockEnsureCanReadClient).toHaveBeenCalledWith(mockSession.user, CLIENT);
    expect(mockGetByClientId).toHaveBeenCalledWith('c-1');
  });

  it('없는 고객사면 404 이고 조회하지 않는다', async () => {
    mockClientFindUnique.mockResolvedValue(null);

    const res = await GET({} as never, context);

    expect(res.status).toBe(404);
    expect(mockGetByClientId).not.toHaveBeenCalled();
  });

  it('읽기 권한이 없으면 조회하지 않는다', async () => {
    mockEnsureCanReadClient.mockImplementation(() => {
      throw Object.assign(new Error('권한이 없습니다.'), { statusCode: 403 });
    });

    const res = await GET({} as never, context);

    expect(res.status).toBe(403);
    expect(mockGetByClientId).not.toHaveBeenCalled();
  });
});

describe('POST /api/clients/[id]/categories', () => {
  it('내부 사용자는 어느 고객사에든 만들 수 있다', async () => {
    mockIsInternalUser.mockReturnValue(true);

    const res = await POST(req(), context);

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
  });

  it('외부 사용자는 자기 소속 고객사에 만들 수 있다', async () => {
    mockIsInternalUser.mockReturnValue(false);
    mockSession.user = { id: 'u-2', roles: ['CLIENT_ADMIN'], permissions: [], clientIds: ['c-1'] };

    const res = await POST(req(), context);

    expect(res.status).toBe(201);
  });

  // 이 대조가 빠지면 CLIENT_ADMIN 이 남의 고객사에 카테고리를 만들 수 있다.
  it('외부 사용자는 남의 고객사에 만들 수 없다', async () => {
    mockIsInternalUser.mockReturnValue(false);
    mockSession.user = {
      id: 'u-2',
      roles: ['CLIENT_ADMIN'],
      permissions: [],
      clientIds: ['c-999'],
    };

    const res = await POST(req(), context);

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('소속이 하나도 없으면 만들 수 없다', async () => {
    mockIsInternalUser.mockReturnValue(false);
    mockSession.user = { id: 'u-2', roles: ['CLIENT_ADMIN'], permissions: [], clientIds: [] };

    const res = await POST(req(), context);

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // 본문 값을 신뢰하면 경로는 자기 고객사로 두고 본문만 바꿔 우회할 수 있다.
  it('clientId 는 본문이 아니라 URL 에서 가져온다', async () => {
    mockParseJsonBody.mockResolvedValue({
      categoryName: '신규',
      slaHours: 8,
      clientId: 'c-남의고객사',
    });

    await POST(req(), context);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'c-1' }),
      'u-1',
      null
    );
  });

  // 감사 로그의 userId 는 행위자다. 라우트가 세션을 넘기지 않으면 서비스는 익명으로 기록한다.
  it('행위자 id 를 서비스에 넘겨 감사 로그에 남게 한다', async () => {
    await POST(req(), context);

    expect(mockCreate).toHaveBeenCalledWith(expect.anything(), 'u-1', null);
  });

  it('없는 고객사면 404 이고 만들지 않는다', async () => {
    mockClientFindUnique.mockResolvedValue(null);

    const res = await POST(req(), context);

    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('입력이 스키마에 맞지 않으면 400 으로 막는다', async () => {
    mockParseJsonBody.mockResolvedValue({ categoryName: '' });

    const res = await POST(req(), context);

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('본문이 비어 있어도 500 이 아니라 400 이다', async () => {
    mockParseJsonBody.mockResolvedValue(null);

    const res = await POST(req(), context);

    expect(res.status).toBe(400);
  });
});
