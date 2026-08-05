/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

const mocks = vi.hoisted(() => ({
  getAllSRs: vi.fn(),
  checkPermission: vi.fn(),
  isInternalUser: vi.fn(),
}));

vi.mock('@/services/sr.service', () => ({
  srService: {
    getAllSRs: mocks.getAllSRs,
  },
}));

vi.mock('@/services/permission.service', () => ({
  PermissionService: class {
    checkPermission = mocks.checkPermission;
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    sR: { count: vi.fn().mockResolvedValue(0) },
  },
}));

vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return {
    ...actual,
    isInternalUser: mocks.isInternalUser,
  };
});

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => handler, // Return the handler directly
}));

vi.mock('@/lib/serialization', () => ({
  serializeResponse: (data: any) => data,
}));

// 정렬 허용목록(SORTABLE_FIELDS)은 실제 값을 그대로 쓴다. 여기서 가짜로 덮으면
// 라우트가 어떤 필드를 정렬에 허용하는지가 테스트 안에서 뒤바뀌어, 허용목록이
// 통째로 빠져도 이 파일은 통과해 버린다.
vi.mock('@/lib/pagination', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pagination')>()),
  usePagination: () => ({
    skip: 0,
    take: 10,
    orderBy: {},
    createResponse: (data: any) => ({ data, meta: {} }),
  }),
}));

// Import the route handler (triggers the mock)
import { GET } from '../route';

describe('API Route Security: /api/srs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should restrict external users to their own clientIds when no filter provided', async () => {
    // Setup
    const mockSession = {
      user: {
        id: 'user-external',
        roles: ['USER'],
        clientIds: ['client-A'],
      },
    };
    mocks.isInternalUser.mockReturnValue(false);

    // Act
    const req = new NextRequest('http://localhost/api/srs');
    await (GET as any)(req, { session: mockSession });

    // Assert
    expect(mocks.getAllSRs).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: ['client-A'] },
        }),
      })
    );
  });

  it('should allow internal users to see all SRs (no forced filter)', async () => {
    // Setup
    const mockSession = {
      user: {
        id: 'user-admin',
        roles: ['ADMIN'],
        clientIds: [],
      },
    };
    mocks.isInternalUser.mockReturnValue(true);

    // Act
    const req = new NextRequest('http://localhost/api/srs');
    await (GET as any)(req, { session: mockSession });

    // Assert: clientId filter should be undefined (no restriction)
    const callArgs = mocks.getAllSRs.mock.calls[0]![0];
    const where = callArgs.where || {};
    expect(where.clientId).toBeUndefined();
  });

  it('should allow internal users to filter by specific client', async () => {
    // Setup
    const mockSession = {
      user: {
        id: 'user-admin',
        roles: ['ADMIN'],
        clientIds: [],
      },
    };
    mocks.isInternalUser.mockReturnValue(true);

    // Act
    const req = new NextRequest('http://localhost/api/srs?clientId=client-B');
    await (GET as any)(req, { session: mockSession });

    // Assert
    expect(mocks.getAllSRs).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 'client-B',
        }),
      })
    );
  });

  it('should return empty list when external user requests unauthorized client', async () => {
    // Setup
    const mockSession = {
      user: {
        id: 'user-external',
        roles: ['USER'],
        clientIds: ['client-A'],
      },
    };
    mocks.isInternalUser.mockReturnValue(false);

    // Act
    const req = new NextRequest('http://localhost/api/srs?clientId=client-B');
    const res = await (GET as any)(req, { session: mockSession });

    // Assert
    // Should NOT call getAllSRs (optimization: return early)
    expect(mocks.getAllSRs).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('should return empty list when external user has NO assigned clients', async () => {
    // Setup
    const mockSession = {
      user: {
        id: 'user-external',
        roles: ['USER'],
        clientIds: [], // No clients
      },
    };
    mocks.isInternalUser.mockReturnValue(false);

    // Act
    const req = new NextRequest('http://localhost/api/srs');
    const res = await (GET as any)(req, { session: mockSession });

    // Assert
    expect(mocks.getAllSRs).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});

/**
 * 쿼리 파라미터 검증 (감사 4.3).
 *
 * 예전에는 `searchParams.get('status') as SRStatus` 로 캐스팅해 Prisma 에 그대로 넘겼다.
 * `?status=FOO` 는 `PrismaClientValidationError` 를 일으켰고, 그 오류가 500 으로
 * 매핑되면서 모델명·필드 목록이 담긴 원문 메시지를 응답 본문에 실었다.
 * 이제는 라우트 진입 시점에 ZodError 로 끝나고 `handleApiError` 가 400 을 만든다.
 */
describe('API Route Validation: /api/srs 쿼리 파라미터', () => {
  const adminSession = {
    user: { id: 'user-admin', roles: ['ADMIN'], clientIds: [] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isInternalUser.mockReturnValue(true);
  });

  it('알 수 없는 status 는 Prisma 에 도달하지 못한다', async () => {
    const req = new NextRequest('http://localhost/api/srs?status=BOGUS');

    await expect((GET as any)(req, { session: adminSession })).rejects.toThrow();
    expect(mocks.getAllSRs).not.toHaveBeenCalled();
  });

  it('알 수 없는 priority 는 Prisma 에 도달하지 못한다', async () => {
    const req = new NextRequest('http://localhost/api/srs?priority=SUPER_URGENT');

    await expect((GET as any)(req, { session: adminSession })).rejects.toThrow();
    expect(mocks.getAllSRs).not.toHaveBeenCalled();
  });

  it('유효한 status/priority 는 그대로 필터로 전달된다', async () => {
    const req = new NextRequest('http://localhost/api/srs?status=IN_PROGRESS&priority=HIGH');
    await (GET as any)(req, { session: adminSession });

    expect(mocks.getAllSRs).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'IN_PROGRESS', priority: 'HIGH' }),
      })
    );
  });

  it('빈 문자열은 "필터 없음"으로 취급한다(UI 의 전체 선택)', async () => {
    const req = new NextRequest('http://localhost/api/srs?status=&priority=');
    await (GET as any)(req, { session: adminSession });

    const where = mocks.getAllSRs.mock.calls[0]![0].where;
    expect(where.status).toBeUndefined();
    expect(where.priority).toBeUndefined();
  });
});
