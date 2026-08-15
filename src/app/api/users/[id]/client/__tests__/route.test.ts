import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 사용자 ↔ 고객사 소속 관리.
 *
 * 소속은 **테넌트 경계 그 자체**다. 여기서 잘못 바뀌면 그 사용자가 볼 수 있는 SR 집합이
 * 통째로 달라진다. 그래서 이 라우트에는 세 겹의 가드가 있고, 각각을 단언한다.
 *
 * 1. **인가는 세션 클레임이 아니라 DB 를 읽어 판정한다.** 세션의 roles 는 발급 시점의
 *    스냅샷이라, 역할을 회수해도 토큰 수명만큼 유효한 창이 남는다. 소속 변경은 그
 *    지연을 허용할 수 없어 매번 userRole 을 조회한다.
 * 2. **역할과 소속은 서로 모순되면 안 된다.** 시스템 운영팀에 고객사를 붙이거나,
 *    고객사 팀 역할을 가진 사용자의 소속을 떼면 판정 불가 상태가 생긴다.
 * 3. **진행 중인 SR 이 있으면 기본적으로 막는다.** 소속을 옮기면 그 SR 들이 원래 테넌트
 *    바깥으로 넘어간다. 확인 없이 조용히 옮기면 되돌릴 수 없다.
 */

const {
  mockSession,
  mockUserRoleFindMany,
  mockUserClientFindFirst,
  mockUserClientDelete,
  mockUserClientUpdate,
  mockUserClientCreate,
  mockClientFindUnique,
  mockSRFindMany,
  mockHandleApiError,
  mockTransaction,
  mockCreateAuditLog,
  prismaMock,
} = vi.hoisted(() => {
  const mockSession = { user: { id: 'actor-1', roles: ['ADMIN'], permissions: [] as string[] } };
  const mockUserRoleFindMany = vi.fn();
  const mockUserClientFindFirst = vi.fn();
  const mockUserClientDelete = vi.fn();
  const mockUserClientUpdate = vi.fn();
  const mockUserClientCreate = vi.fn();
  const mockTransaction = vi.fn();
  const mockCreateAuditLog = vi.fn();
  const mockClientFindUnique = vi.fn();
  const mockSRFindMany = vi.fn();
  const mockHandleApiError = vi.fn((error: { statusCode?: number; message?: string }) =>
    NextResponse.json({ error: error.message ?? 'Error' }, { status: error.statusCode ?? 500 })
  );

  // vi.mock 팩토리가 참조하므로 여기(호이스팅 블록) 안에서 만들어야 한다.
  const prismaMock = {
    userRole: { findMany: mockUserRoleFindMany },
    userClient: {
      findFirst: mockUserClientFindFirst,
      delete: mockUserClientDelete,
      update: mockUserClientUpdate,
      create: mockUserClientCreate,
    },
    client: { findUnique: mockClientFindUnique },
    sR: { findMany: mockSRFindMany },
    $transaction: mockTransaction,
  };

  return {
    mockSession,
    mockUserRoleFindMany,
    mockUserClientFindFirst,
    mockUserClientDelete,
    mockUserClientUpdate,
    mockUserClientCreate,
    mockClientFindUnique,
    mockSRFindMany,
    mockHandleApiError,
    mockTransaction,
    mockCreateAuditLog,
    prismaMock,
  };
});

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

/**
 * 소속 변경·해제는 이제 감사 로그와 **같은 트랜잭션**에서 일어난다(감사 D-16).
 * 그래서 쓰기는 `prisma` 가 아니라 `tx` 로 나간다 — 트랜잭션 콜백에 같은 델리게이트를
 * 넘겨 주어 목이 그대로 관측되게 한다.
 */
vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

vi.mock('@/services/audit.service', () => ({
  auditService: { createLog: mockCreateAuditLog },
}));

import { DELETE, PATCH } from '../route';

const context = { params: Promise.resolve({ id: 'target-1' }) } as never;
const req = (body: unknown = {}) => ({ json: async () => body }) as never;

/** userRole.findMany 응답. */
const withRoles = (...names: string[]) => names.map((name) => ({ role: { name } }));

beforeEach(() => {
  vi.clearAllMocks();
  // 트랜잭션 콜백에 같은 델리게이트를 넘겨 목이 그대로 관측되게 한다.
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
  mockCreateAuditLog.mockResolvedValue(undefined);
  // 감사 로그가 생성된 행의 id 를 targetId 로 쓰므로 반환값이 필요하다.
  mockUserClientCreate.mockResolvedValue({ id: 'uc-new' });
  mockUserClientUpdate.mockResolvedValue({ id: 'uc-1' });
  mockSession.user = { id: 'actor-1', roles: ['ADMIN'], permissions: [] };
  // 기본: 행위자는 ADMIN, 대상은 역할 없음.
  mockUserRoleFindMany.mockResolvedValue(withRoles('ADMIN'));
  mockUserClientFindFirst.mockResolvedValue(null);
  mockClientFindUnique.mockResolvedValue({ id: 'c-1', name: '테스트 고객사 A' });
  mockSRFindMany.mockResolvedValue([]);
});

describe('인가 — 세션이 아니라 DB 로 판정한다', () => {
  it('ADMIN·MANAGER 가 아니면 거부한다', async () => {
    // 세션에는 ADMIN 이라고 적혀 있어도 DB 가 기준이다.
    mockUserRoleFindMany.mockResolvedValue(withRoles('ENGINEER'));

    const res = await DELETE(req(), context);

    expect(res.status).toBe(403);
    expect(mockUserClientDelete).not.toHaveBeenCalled();
  });

  it('MANAGER 는 관리할 수 있다 — 과잉 차단 방지 대조군', async () => {
    mockUserRoleFindMany
      .mockResolvedValueOnce(withRoles('MANAGER'))
      .mockResolvedValueOnce(withRoles());
    mockUserClientFindFirst.mockResolvedValue({ id: 'uc-1', clientId: 'c-0' });

    const res = await DELETE(req(), context);

    expect(res.status).toBe(200);
    expect(mockUserClientDelete).toHaveBeenCalledWith({ where: { id: 'uc-1' } });
  });
});

describe('DELETE — 소속 해제', () => {
  it('소속이 없으면 404', async () => {
    mockUserClientFindFirst.mockResolvedValue(null);

    const res = await DELETE(req(), context);

    expect(res.status).toBe(404);
    expect(mockUserClientDelete).not.toHaveBeenCalled();
  });

  // 고객사 사용자인데 소속이 없으면 그 계정은 아무 SR 도 볼 수 없는 미아가 된다.
  it('고객사 팀 역할을 가진 사용자의 소속은 뗄 수 없다', async () => {
    mockUserRoleFindMany
      .mockResolvedValueOnce(withRoles('ADMIN'))
      .mockResolvedValueOnce(withRoles('CLIENT_ADMIN'));
    mockUserClientFindFirst.mockResolvedValue({ id: 'uc-1', clientId: 'c-0' });

    const res = await DELETE(req(), context);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.clientRoles).toEqual(['CLIENT_ADMIN']);
    expect(mockUserClientDelete).not.toHaveBeenCalled();
  });
});

describe('PATCH — 소속 변경', () => {
  const assign = (over: Record<string, unknown> = {}) => req({ clientId: 'c-1', ...over });

  it('없는 고객사로는 옮길 수 없다', async () => {
    mockClientFindUnique.mockResolvedValue(null);

    const res = await PATCH(assign(), context);

    expect(res.status).toBe(404);
    expect(mockUserClientCreate).not.toHaveBeenCalled();
  });

  // 내부 사용자에게 고객사를 붙이면 "전체를 보면서 동시에 한 고객사 소속" 이라는
  // 모순 상태가 되어 테넌트 판정이 무너진다.
  it('시스템 운영팀에는 고객사를 할당할 수 없다', async () => {
    mockUserRoleFindMany
      .mockResolvedValueOnce(withRoles('ADMIN'))
      .mockResolvedValueOnce(withRoles('ENGINEER'));

    const res = await PATCH(assign(), context);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.details).toContain('ENGINEER');
    expect(mockUserClientCreate).not.toHaveBeenCalled();
  });

  it('소속이 없던 사용자에게는 새로 만든다', async () => {
    mockUserRoleFindMany
      .mockResolvedValueOnce(withRoles('ADMIN'))
      .mockResolvedValueOnce(withRoles('CLIENT_USER'));
    mockUserClientFindFirst.mockResolvedValue(null);

    const res = await PATCH(assign(), context);

    expect(res.status).toBe(200);
    expect(mockUserClientCreate).toHaveBeenCalled();
    expect(mockUserClientUpdate).not.toHaveBeenCalled();
  });

  it('이미 소속이 있으면 갱신한다', async () => {
    mockUserRoleFindMany
      .mockResolvedValueOnce(withRoles('ADMIN'))
      .mockResolvedValueOnce(withRoles('CLIENT_USER'));
    mockUserClientFindFirst.mockResolvedValue({
      id: 'uc-1',
      clientId: 'c-0',
      client: { id: 'c-0', name: '이전 고객사' },
    });

    const res = await PATCH(assign(), context);

    expect(res.status).toBe(200);
    expect(mockUserClientUpdate).toHaveBeenCalledWith({
      where: { id: 'uc-1' },
      data: { clientId: 'c-1' },
    });
  });
});

describe('PATCH — 진행 중인 SR 보호', () => {
  const ongoing = [
    {
      id: 'sr-1',
      srNumber: 'SR-0001',
      title: '진행 중',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      client: { name: '이전 고객사' },
      assignee: { name: '담당자' },
    },
  ];

  beforeEach(() => {
    mockUserRoleFindMany
      .mockResolvedValueOnce(withRoles('ADMIN'))
      .mockResolvedValueOnce(withRoles('CLIENT_USER'));
    mockSRFindMany.mockResolvedValue(ongoing);
  });

  // 조용히 옮기면 그 SR 들이 원래 테넌트 밖으로 넘어가고 되돌릴 수 없다.
  it('진행 중인 SR 이 있으면 409 로 멈추고 소속은 그대로 둔다', async () => {
    const res = await PATCH(req({ clientId: 'c-1' }), context);
    const payload = await res.json();

    expect(res.status).toBe(409);
    expect(payload.code).toBe('ONGOING_SRS');
    // 호출자가 사용자에게 무엇을 확인시켜야 하는지 알 수 있어야 한다.
    expect(payload.data.ongoingSRCount).toBe(1);
    expect(payload.data.ongoingSRs[0].srNumber).toBe('SR-0001');
    expect(mockUserClientCreate).not.toHaveBeenCalled();
    expect(mockUserClientUpdate).not.toHaveBeenCalled();
  });

  it('force 로 재요청하면 진행한다', async () => {
    const res = await PATCH(req({ clientId: 'c-1', force: true }), context);

    expect(res.status).toBe(200);
    expect(mockUserClientCreate).toHaveBeenCalled();
  });
});

/**
 * 감사 D-16 회귀 방어.
 *
 * 고객사 소속은 그 사용자가 볼 수 있는 데이터 범위를 정한다. 헌법 §1.2 는 이런 민감
 * 행위를 감사 로그로 영구 저장하라고 규정하는데, 형제 경로인 `approve` 는 처음부터
 * 남기고 있었던 반면 이 두 경로만 빠져 있었다 — 관리자가 소속을 몰래 바꾼 뒤
 * 데이터를 열람해도 어떤 기록도 남지 않았다.
 */
describe('감사 로그 — 소속 변경은 기록된다', () => {
  it('소속 해제를 감사 로그로 남긴다', async () => {
    mockUserRoleFindMany.mockResolvedValue(withRoles('ADMIN'));
    mockUserClientFindFirst.mockResolvedValue({ id: 'uc-1', clientId: 'c-0' });

    await DELETE(req(), context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: 'DELETE',
        targetEntity: 'UserClient',
        targetId: 'uc-1',
      })
    );
  });

  it('소속 변경은 변경 전후를 함께 남긴다', async () => {
    // 이 목은 **행위자**(인가 판정)와 **대상**(배타성 판정) 양쪽에 쓰인다.
    // 첫 호출은 행위자(ADMIN), 두 번째는 대상(고객사 역할)이어야 한다 —
    // 시스템 운영 역할에는 소속을 붙일 수 없기 때문이다(헌법 §1.3).
    mockUserRoleFindMany
      .mockResolvedValueOnce(withRoles('ADMIN'))
      .mockResolvedValueOnce(withRoles('CLIENT_USER'));
    mockUserClientFindFirst.mockResolvedValue({ id: 'uc-1', clientId: 'c-0' });

    await PATCH(req({ clientId: 'c-1' }), context);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: 'UPDATE',
        targetEntity: 'UserClient',
        // 어디에서 어디로 옮겼는지가 남아야 사후 규명이 된다.
        changes: expect.objectContaining({ before: 'c-0', after: 'c-1' }),
      })
    );
  });

  it('쓰기와 감사 로그는 같은 트랜잭션에서 일어난다', async () => {
    mockUserRoleFindMany
      .mockResolvedValueOnce(withRoles('ADMIN'))
      .mockResolvedValueOnce(withRoles('CLIENT_USER'));
    mockUserClientFindFirst.mockResolvedValue({ id: 'uc-1', clientId: 'c-0' });

    await PATCH(req({ clientId: 'c-1' }), context);

    // 갈라지면 "바뀌었는데 기록이 없는" 상태나 그 반대가 생긴다.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
