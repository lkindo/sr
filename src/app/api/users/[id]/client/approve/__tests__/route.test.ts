import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 고객사 소속 승인 / 거절.
 *
 * 이 라우트가 흥미로운 것은 **승인자가 두 종류**라는 점이다.
 *
 * - 시스템 승인자(ADMIN·MANAGER): 어느 고객사든 승인할 수 있다.
 * - 고객사 관리자(CLIENT_ADMIN): **자기 고객사만** 승인할 수 있다.
 *
 * 두 번째가 위험 지점이다. `clientIds` 대조가 빠지면 아무 고객사의 CLIENT_ADMIN 이
 * 다른 고객사에 소속 요청을 넣고 스스로 승인해, 남의 테넌트 데이터를 볼 수 있다.
 * 즉 이 한 줄이 셀프 서비스 가입 흐름 전체의 경계다.
 *
 * 그리고 승인은 상태 변경 + 감사 로그를 **한 트랜잭션**에서 해야 한다. 나뉘면
 * "승인은 됐는데 누가 했는지 기록이 없는" 상태가 남는다.
 */

const {
  mockSession,
  mockFindFirst,
  mockTransaction,
  mockUpdate,
  mockDelete,
  mockCreateLog,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockSession: {
    user: {
      id: 'actor-1',
      roles: ['ADMIN'] as string[],
      permissions: [],
      clientIds: [] as string[],
    },
  },
  mockFindFirst: vi.fn(),
  mockTransaction: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockCreateLog: vi.fn(),
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

vi.mock('@/lib/prisma', () => ({
  default: {
    userClient: { findFirst: mockFindFirst, update: mockUpdate, delete: mockDelete },
    $transaction: mockTransaction,
  },
}));

vi.mock('@/services/audit.service', () => ({
  auditService: { createLog: mockCreateLog },
}));

import { DELETE, POST } from '../route';

const context = { params: Promise.resolve({ id: 'target-1' }) } as never;
const req = () => ({ json: async () => ({}) }) as never;

const PENDING = { id: 'uc-1', userId: 'target-1', clientId: 'c-1', status: 'PENDING' };

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.user = { id: 'actor-1', roles: ['ADMIN'], permissions: [], clientIds: [] };
  mockFindFirst.mockResolvedValue(PENDING);
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ userClient: { update: mockUpdate, delete: mockDelete } })
  );
});

describe('POST — 승인', () => {
  it('ADMIN 은 어느 고객사든 승인할 수 있다', async () => {
    const res = await POST(req(), context);

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) })
    );
  });

  it('MANAGER 도 승인할 수 있다', async () => {
    mockSession.user = { id: 'actor-1', roles: ['MANAGER'], permissions: [], clientIds: [] };

    const res = await POST(req(), context);

    expect(res.status).toBe(200);
  });

  it('자기 고객사의 CLIENT_ADMIN 은 승인할 수 있다', async () => {
    mockSession.user = {
      id: 'actor-1',
      roles: ['CLIENT_ADMIN'],
      permissions: [],
      clientIds: ['c-1'],
    };

    const res = await POST(req(), context);

    expect(res.status).toBe(200);
  });

  // 이 한 줄이 셀프 가입 흐름 전체의 테넌트 경계다. clientIds 대조가 빠지면
  // 아무 고객사의 CLIENT_ADMIN 이 남의 테넌트에 스스로를 넣을 수 있다.
  it('다른 고객사의 CLIENT_ADMIN 은 승인할 수 없다', async () => {
    mockSession.user = {
      id: 'actor-1',
      roles: ['CLIENT_ADMIN'],
      permissions: [],
      clientIds: ['c-999'],
    };

    const res = await POST(req(), context);

    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('역할이 없으면 승인할 수 없다', async () => {
    mockSession.user = {
      id: 'actor-1',
      roles: ['CLIENT_USER'],
      permissions: [],
      clientIds: ['c-1'],
    };

    const res = await POST(req(), context);

    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('대기 중인 요청이 없으면 404', async () => {
    mockFindFirst.mockResolvedValue(null);

    const res = await POST(req(), context);

    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // 나뉘면 "승인은 됐는데 누가 했는지 기록이 없는" 상태가 남는다.
  it('상태 변경과 감사 로그를 한 트랜잭션에서 처리한다', async () => {
    await POST(req(), context);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changes: expect.objectContaining({ status: 'APPROVED' }),
      })
    );
  });
});

describe('DELETE — 거절', () => {
  it('승인 권한이 있으면 대기 요청을 지운다', async () => {
    const res = await DELETE(req(), context);

    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'uc-1' } });
  });

  it('다른 고객사의 CLIENT_ADMIN 은 거절도 할 수 없다', async () => {
    mockSession.user = {
      id: 'actor-1',
      roles: ['CLIENT_ADMIN'],
      permissions: [],
      clientIds: ['c-999'],
    };

    const res = await DELETE(req(), context);

    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('대기 중인 요청이 없으면 404', async () => {
    mockFindFirst.mockResolvedValue(null);

    const res = await DELETE(req(), context);

    expect(res.status).toBe(404);
  });
});
