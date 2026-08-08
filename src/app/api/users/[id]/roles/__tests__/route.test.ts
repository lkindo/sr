import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 역할 할당 라우트 — 인가와 상호 배타성.
 *
 * 이 라우트는 **권한 상승의 가장 짧은 경로**다. 여기서 게이트 하나가 빠지면
 * `ROLE:ASSIGN` 만 가진 사용자가 자기 자신에게 ADMIN 을 붙여 전권이 된다.
 * 그래서 단언의 대부분은 "막았는가" 이고, 막았다는 것은 **에러를 던졌는가**가 아니라
 * **역할 교체 트랜잭션이 실행되지 않았는가**로 확인한다 — 던지고도 쓰기가 일어나면
 * 아무것도 막지 못한 것이다.
 *
 * 상호 배타성(시스템 운영팀 ↔ 고객사 팀)은 보안이 아니라 데이터 정합성 규칙이지만,
 * 어기면 테넌트 스코프 판정이 모순 상태가 된다 — 내부 사용자로 전체를 보면서 동시에
 * 특정 고객사 소속인 사용자가 생긴다.
 */

const {
  mockSession,
  mockUserFindUnique,
  mockRoleFindMany,
  mockTransaction,
  mockUserRoleDeleteMany,
  mockUserRoleCreateMany,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockSession: { user: { id: 'actor-1', roles: ['ADMIN'], permissions: [] as string[] } },
  mockUserFindUnique: vi.fn(),
  mockRoleFindMany: vi.fn(),
  mockTransaction: vi.fn(),
  mockUserRoleDeleteMany: vi.fn(),
  mockUserRoleCreateMany: vi.fn(),
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

// 스키마 검증 자체는 schemas 테스트가 담당한다. 여기서는 본문을 그대로 통과시켜
// 인가·배타성 판정에 집중한다.
vi.mock('@/lib/api-helpers', () => ({
  validateRequestBody: async (request: { json: () => Promise<unknown> }) => request.json(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: { findUnique: mockUserFindUnique },
    role: { findMany: mockRoleFindMany },
    $transaction: mockTransaction,
  },
}));

import { POST } from '../route';

/** 라우트가 기대하는 최소 요청 형태. */
const request = (roleIds: string[]) => ({ json: async () => ({ roleIds }) }) as never;

const context = { params: Promise.resolve({ id: 'target-1' }) } as never;

/** 역할 id → 이름. findMany 응답을 만든다. */
const roles = (map: Record<string, string>) =>
  Object.entries(map).map(([id, name]) => ({ id, name }));

const targetUser = (clientNames: string[] = []) => ({
  id: 'target-1',
  clients: clientNames.map((name, i) => ({ client: { id: `c-${i}`, name } })),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.user = { id: 'actor-1', roles: ['ADMIN'], permissions: [] };
  mockUserFindUnique.mockResolvedValue(targetUser());
  mockRoleFindMany.mockResolvedValue([]);
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      userRole: { deleteMany: mockUserRoleDeleteMany, createMany: mockUserRoleCreateMany },
    })
  );
});

describe('POST /api/users/[id]/roles — 인가', () => {
  it('ADMIN 도 ROLE:ASSIGN 도 없으면 거부한다', async () => {
    mockSession.user = { id: 'actor-1', roles: ['MANAGER'], permissions: ['USER:UPDATE'] };

    const res = await POST(request(['r-1']), context);

    expect(res.status).toBe(403);
    // 던졌다가 아니라 "쓰기가 없었다" 로 확인한다.
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('ROLE:ASSIGN 보유자는 할당할 수 있다 — 과잉 차단 방지 대조군', async () => {
    mockSession.user = { id: 'actor-1', roles: ['MANAGER'], permissions: ['ROLE:ASSIGN'] };
    mockRoleFindMany.mockResolvedValue(roles({ 'r-1': 'ENGINEER' }));
    mockUserFindUnique
      .mockResolvedValueOnce(targetUser())
      .mockResolvedValueOnce({ id: 'target-1' });

    const res = await POST(request(['r-1']), context);

    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
  });

  // 이것이 이 라우트에서 가장 중요한 게이트다.
  it('ADMIN 이 아니면 ADMIN 역할을 할당할 수 없다', async () => {
    mockSession.user = { id: 'actor-1', roles: ['MANAGER'], permissions: ['ROLE:ASSIGN'] };
    mockRoleFindMany.mockResolvedValue(roles({ 'r-admin': 'ADMIN' }));

    const res = await POST(request(['r-admin']), context);

    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('존재하지 않는 사용자면 404', async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const res = await POST(request(['r-1']), context);

    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // 잘못된 id 로 createMany 가 터지면 트랜잭션이 롤백되긴 하지만, 사용자에게는
  // 원인을 알 수 없는 500 이 간다. 사전 검증으로 명확한 400 을 준다.
  it('존재하지 않는 역할 id 가 섞이면 400 으로 막는다', async () => {
    mockRoleFindMany.mockResolvedValue(roles({ 'r-1': 'ENGINEER' }));

    const res = await POST(request(['r-1', 'r-없음']), context);

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/users/[id]/roles — 역할 상호 배타성', () => {
  it('시스템 운영팀과 고객사 팀 역할을 동시에 부여할 수 없다', async () => {
    mockRoleFindMany.mockResolvedValue(roles({ 'r-1': 'ENGINEER', 'r-2': 'CLIENT_USER' }));

    const res = await POST(request(['r-1', 'r-2']), context);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('동시에 부여할 수 없습니다');
    // 어느 역할이 충돌했는지 알려 주지 않으면 관리자가 고칠 수가 없다.
    expect(body.systemRoles).toEqual(['ENGINEER']);
    expect(body.clientRoles).toEqual(['CLIENT_USER']);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('고객사가 할당된 사용자에게는 시스템 운영팀 역할을 줄 수 없다', async () => {
    mockUserFindUnique.mockResolvedValue(targetUser(['테스트 고객사 A']));
    mockRoleFindMany.mockResolvedValue(roles({ 'r-1': 'MANAGER' }));

    const res = await POST(request(['r-1']), context);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.details).toContain('테스트 고객사 A');
    expect(body.assignedClients).toHaveLength(1);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('고객사가 없는 사용자에게는 고객사 팀 역할을 줄 수 없다', async () => {
    mockUserFindUnique.mockResolvedValue(targetUser([]));
    mockRoleFindMany.mockResolvedValue(roles({ 'r-1': 'CLIENT_ADMIN' }));

    const res = await POST(request(['r-1']), context);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.clientRoles).toEqual(['CLIENT_ADMIN']);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('고객사가 할당된 사용자에게 고객사 팀 역할은 정상 부여된다', async () => {
    mockUserFindUnique
      .mockResolvedValueOnce(targetUser(['테스트 고객사 A']))
      .mockResolvedValueOnce({ id: 'target-1' });
    mockRoleFindMany.mockResolvedValue(roles({ 'r-1': 'CLIENT_USER' }));

    const res = await POST(request(['r-1']), context);

    expect(res.status).toBe(200);
    expect(mockUserRoleCreateMany).toHaveBeenCalled();
  });
});

describe('POST /api/users/[id]/roles — 교체의 원자성', () => {
  it('삭제와 생성을 한 트랜잭션에서 수행한다', async () => {
    mockUserFindUnique
      .mockResolvedValueOnce(targetUser())
      .mockResolvedValueOnce({ id: 'target-1' });
    mockRoleFindMany.mockResolvedValue(roles({ 'r-1': 'ENGINEER' }));

    await POST(request(['r-1']), context);

    // 나뉘어 실행되면 중간 실패 시 사용자가 역할 0개(로그인은 되지만 아무것도 못 하는
    // 잠금 상태)로 남는다.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockUserRoleDeleteMany).toHaveBeenCalledWith({ where: { userId: 'target-1' } });
    expect(mockUserRoleCreateMany).toHaveBeenCalledWith({
      data: [{ userId: 'target-1', roleId: 'r-1' }],
      skipDuplicates: true,
    });
  });

  // 빈 배열은 "모든 역할 회수" 라는 정당한 요청이다. 검증 블록을 통째로 건너뛰므로
  // 실수로 막히기 쉬운 경로다.
  it('빈 목록은 모든 역할을 회수한다', async () => {
    mockUserFindUnique
      .mockResolvedValueOnce(targetUser())
      .mockResolvedValueOnce({ id: 'target-1' });

    const res = await POST(request([]), context);

    expect(res.status).toBe(200);
    expect(mockUserRoleDeleteMany).toHaveBeenCalledWith({ where: { userId: 'target-1' } });
    expect(mockUserRoleCreateMany).not.toHaveBeenCalled();
    // 역할 조회 자체가 필요 없다.
    expect(mockRoleFindMany).not.toHaveBeenCalled();
  });
});
