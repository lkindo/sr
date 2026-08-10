/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `src/app/api/srs/[id]/intake/route.ts` 의 **분기** 커버리지 테스트.
 *
 * 이웃한 `route.events.test.ts` 는 도메인/실시간 이벤트 발행만 본다(감사 3.21 회귀).
 * 이 파일은 그 파일이 건드리지 않는 나머지 — 권한 매트릭스, 테넌트 격리, 상태 게이트,
 * 낙관적 락, 부분 수정(PATCH)의 필드별 조합 — 을 양쪽 경로로 태운다.
 *
 * 정책(`@/lib/policies`)은 **목이 아니라 실물**을 쓴다. 라우트가 위임하는 판정이
 * 실제로 어떤 세션에서 통과/거부되는지가 이 테스트의 관심사이기 때문이다.
 */

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  emitRealtime: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  // 트랜잭션 클라이언트(tx)의 활동 생성과 루트 클라이언트(prisma)의 활동 생성을 **다른 목**으로
  // 둔다. 하나로 합치면 활동 로그가 트랜잭션 안에 있는지 밖에 있는지를 테스트가 구분하지
  // 못한다 — PATCH 가 커밋 이후에 활동을 만들던 버그가 바로 그렇게 통과했다.
  activityCreate: vi.fn(),
  rootActivityCreate: vi.fn(),
  updateMany: vi.fn(),
  txUpdate: vi.fn(),
  assertAssignable: vi.fn(),
}));

vi.mock('@/lib/domain-events', () => ({
  domainEvents: { emit: mocks.emit },
}));

vi.mock('@/lib/realtime-events', () => ({
  emitRealtimeEvent: mocks.emitRealtime,
  REALTIME_EVENTS: {
    SR_UPDATED: 'sr:updated',
    SR_CREATED: 'sr:created',
    SR_DELETED: 'sr:deleted',
    SR_COMMENTED: 'sr:commented',
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    sR: { findUnique: mocks.findUnique, updateMany: mocks.updateMany, update: mocks.txUpdate },
    sRActivity: { create: mocks.rootActivityCreate },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/services/sr.service', () => ({
  assertAssignable: mocks.assertAssignable,
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => async (req: any, ctx: any) => {
    try {
      return await handler(req, ctx);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
    }
  },
}));

import { GET, PATCH, POST } from '../route';

// ── 고정 데이터 ────────────────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000;

const ASSIGNEE = { id: 'eng-1', name: '담당 엔지니어', email: 'eng@example.com' };
const OTHER_ASSIGNEE = { id: 'eng-2', name: '새 엔지니어', email: 'eng2@example.com' };

const BASE_SR = {
  id: 'sr-1',
  srNumber: 'SR-20260801-0001',
  title: '테스트 SR',
  status: 'REQUESTED',
  clientId: 'client-1',
  requesterId: 'req-1',
  assigneeId: null as string | null,
  serviceCategory: { id: 'cat-1', slaHours: 24 },
  client: { id: 'client-1', name: '고객사' },
  requester: { id: 'req-1', name: '요청자', email: 'req@example.com' },
};

const UPDATED_SR = {
  ...BASE_SR,
  status: 'INTAKE',
  assigneeId: ASSIGNEE.id,
};

type SessionUser = {
  id: string;
  name?: string | null;
  email?: string;
  roles?: string[];
  permissions?: string[];
  clientIds?: string[];
};

const session = (user: SessionUser) => ({ user });

/** 내부 운영자 — POST/PATCH 양쪽 게이트를 모두 통과하는 기본 세션. */
const MANAGER = session({
  id: 'mgr-1',
  name: '매니저',
  email: 'mgr@example.com',
  roles: ['MANAGER'],
  permissions: [],
  clientIds: [],
});

const ADMIN = session({
  id: 'adm-1',
  name: '관리자',
  email: 'adm@example.com',
  roles: ['ADMIN'],
  permissions: [],
  clientIds: [],
});

const POST_BODY = {
  actualPriority: 'HIGH' as const,
  estimatedHours: 8,
  estimatedCompletionDate: '2026-08-05T00:00:00.000Z',
  assigneeId: ASSIGNEE.id,
  intakeNotes: '접수 완료',
};

const request = (method: string, body?: unknown) =>
  new NextRequest('http://localhost:3000/api/srs/sr-1/intake', {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });

const post = (body: unknown = POST_BODY, sess: unknown = MANAGER) =>
  (POST as any)(request('POST', body), { session: sess, params: Promise.resolve({ id: 'sr-1' }) });

const patch = (body: unknown, sess: unknown = MANAGER) =>
  (PATCH as any)(request('PATCH', body), {
    session: sess,
    params: Promise.resolve({ id: 'sr-1' }),
  });

const get = (sess: unknown = ADMIN) =>
  (GET as any)(request('GET'), { session: sess, params: Promise.resolve({ id: 'sr-1' }) });

/** 마지막 `tx.sR.update({ data })` 의 data. */
const lastUpdateData = (): any => mocks.txUpdate.mock.calls.at(-1)?.[0]?.data;
/** n 번째 `tx.sRActivity.create({ data })` 의 data. */
const activityData = (n: number): any => mocks.activityCreate.mock.calls[n]?.[0]?.data;

/**
 * 트랜잭션 경계와 그 안에서 일어난 일의 **시간 순서** 기록.
 *
 * 목 Prisma 는 실제로 롤백하지 않으므로, "활동 로그가 커밋 전에 만들어졌는가"와
 * "콜백이 실패하면 트랜잭션 전체가 실패하는가"를 이 순서열로 관찰한다.
 * (`tx:rollback` 이 찍혔다는 것은 `$transaction` 이 reject 됐다는 뜻이고,
 *  실제 Prisma 는 그 시점에 `tx.sR.update` 까지 되돌린다.)
 */
const order: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  mocks.findUnique.mockResolvedValue(BASE_SR);
  mocks.assertAssignable.mockResolvedValue(ASSIGNEE);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.activityCreate.mockImplementation(async () => {
    order.push('activity');
    return {};
  });
  mocks.rootActivityCreate.mockResolvedValue({});
  mocks.txUpdate.mockImplementation(async () => {
    order.push('sr.update');
    return UPDATED_SR;
  });
  mocks.transaction.mockImplementation(async (cb: any) => {
    order.push('tx:begin');
    try {
      const result = await cb({
        sR: { updateMany: mocks.updateMany, update: mocks.txUpdate },
        sRActivity: { create: mocks.activityCreate },
      });
      order.push('tx:commit');
      return result;
    } catch (error) {
      order.push('tx:rollback');
      throw error;
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════
// POST — 접수
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/srs/[id]/intake — 권한 게이트', () => {
  // hasIntakePermission × hasIntakeRole 네 조합. 라우트는 OR 게이트이므로
  // 둘 다 없을 때만 403 이어야 한다.
  it.each([
    ['권한 O · 역할 O', ['SR:INTAKE'], ['MANAGER'], 200],
    ['권한 O · 역할 X', ['SR:INTAKE'], ['CLIENT_USER'], 200],
    ['권한 X · 역할 O', ['SR:READ'], ['ENGINEER'], 200],
    ['권한 X · 역할 X', ['SR:READ'], ['CLIENT_USER'], 403],
  ])('%s → %d', async (_label, permissions, roles, expected) => {
    const response = await post(
      POST_BODY,
      session({
        id: 'u-1',
        roles: roles as string[],
        permissions: permissions as string[],
        clientIds: ['client-1'],
      })
    );

    expect(response.status).toBe(expected);
  });

  it('SR:INTAKE 판정은 대소문자를 무시한다 (소문자 권한도 통과)', async () => {
    const response = await post(
      POST_BODY,
      session({
        id: 'u-1',
        roles: ['CLIENT_USER'],
        permissions: ['sr:intake'],
        clientIds: ['client-1'],
      })
    );

    expect(response.status).toBe(200);
  });

  it('permissions 가 없는 세션도 내부 역할만으로 통과한다', async () => {
    // `permissions?.some(...) ?? false` 의 nullish 경로
    const response = await post(POST_BODY, session({ id: 'u-1', roles: ['ADMIN'] }));

    expect(response.status).toBe(200);
  });

  it('roles 가 없는 세션도 SR:INTAKE 권한만으로 통과한다', async () => {
    // `session.user?.roles || []` 의 fallback 경로 (+ 외부 사용자 취급 → 테넌트 확인)
    const response = await post(
      POST_BODY,
      session({ id: 'u-1', permissions: ['SR:INTAKE'], clientIds: ['client-1'] })
    );

    expect(response.status).toBe(200);
  });

  it('권한도 역할도 없으면 403 과 안내 메시지를 돌려준다', async () => {
    const response = await post(POST_BODY, session({ id: 'u-1' }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('SR 접수 권한이 없습니다');
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /api/srs/[id]/intake — 테넌트 격리', () => {
  const external = (clientIds?: string[]) =>
    session({ id: 'ext-1', roles: ['CLIENT_USER'], permissions: ['SR:INTAKE'], clientIds });

  it('소속 고객사의 SR 이면 외부 사용자도 접수할 수 있다', async () => {
    const response = await post(POST_BODY, external(['client-1', 'client-9']));

    expect(response.status).toBe(200);
  });

  it('다른 고객사의 SR 이면 403 이다', async () => {
    const response = await post(POST_BODY, external(['client-9']));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('해당 고객사의 SR을 접수 처리할 권한이 없습니다.');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('clientIds 가 없는 외부 사용자는 차단된다', async () => {
    // `session.user.clientIds || []` 의 fallback → includes 항상 false
    const response = await post(POST_BODY, external(undefined));

    expect(response.status).toBe(403);
  });

  it('내부 사용자는 소속 고객사가 비어 있어도 테넌트 검사를 건너뛴다', async () => {
    const response = await post(POST_BODY, MANAGER);

    expect(response.status).toBe(200);
  });
});

describe('POST /api/srs/[id]/intake — 선행 조건', () => {
  it('SR 이 없으면 404 다', async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain('찾을 수 없습니다');
  });

  it.each(['INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CONFIRMED', 'REJECTED'])(
    'status 가 %s 이면 이미 접수된 SR 로 400 이다',
    async (status) => {
      mocks.findUnique.mockResolvedValue({ ...BASE_SR, status });

      const response = await post();
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('이미 접수된 SR입니다');
      expect(mocks.assertAssignable).not.toHaveBeenCalled();
    }
  );

  it('바디 검증에 실패하면 400 이고 SR 을 조회하지 않는다', async () => {
    const response = await post({ ...POST_BODY, estimatedHours: 0 });

    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('담당자 배정 규칙을 위반하면 assertAssignable 의 에러가 그대로 전파된다', async () => {
    const { BadRequestError } = await import('@/lib/errors');
    mocks.assertAssignable.mockRejectedValue(
      new BadRequestError('비활성 상태의 사용자에게는 담당자를 배정할 수 없습니다.')
    );

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('비활성 상태의 사용자에게는 담당자를 배정할 수 없습니다.');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/srs/[id]/intake — 낙관적 락', () => {
  it('상태 조건 매칭이 0건이면 409 이고 update 를 실행하지 않는다', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('이미 접수되었거나 다른 사용자가 먼저 접수 처리했습니다.');
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.emitRealtime).not.toHaveBeenCalled();
  });

  it('가드는 REQUESTED 상태로만 매칭한다', async () => {
    await post();

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sr-1', status: 'REQUESTED' } })
    );
  });
});

describe('POST /api/srs/[id]/intake — 저장 데이터', () => {
  it.each([
    ['메모가 있으면 그대로 저장한다', '접수 완료', '접수 완료'],
    ['빈 문자열이면 null 로 저장한다', '', null],
  ])('%s', async (_label, intakeNotes, expected) => {
    await post({ ...POST_BODY, intakeNotes });

    expect(lastUpdateData().intakeNotes).toBe(expected);
  });

  it('메모를 아예 보내지 않으면 null 로 저장한다', async () => {
    const { intakeNotes: _omitted, ...withoutNotes } = POST_BODY;

    await post(withoutNotes);

    expect(lastUpdateData().intakeNotes).toBeNull();
  });

  it('접수가 정한 우선순위를 실효 우선순위(priority)로 승격한다', async () => {
    await post({ ...POST_BODY, actualPriority: 'CRITICAL' });

    const data = lastUpdateData();
    expect(data.actualPriority).toBe('CRITICAL');
    expect(data.priority).toBe('CRITICAL');
    expect(data.status).toBe('INTAKE');
  });

  it.each([
    ['CRITICAL', 0.5],
    ['HIGH', 0.75],
    ['MEDIUM', 1.0],
    ['LOW', 1.5],
  ])('마감일은 slaHours × %s 배율로 계산된다', async (actualPriority, multiplier) => {
    const before = Date.now();
    await post({ ...POST_BODY, actualPriority });
    const after = Date.now();

    // slaHours 24 × multiplier 시간 뒤
    const offset = 24 * (multiplier as number) * HOUR;
    const dueDate: Date = lastUpdateData().dueDate;
    expect(dueDate).toBeInstanceOf(Date);
    expect(dueDate.getTime()).toBeGreaterThanOrEqual(before + offset);
    expect(dueDate.getTime()).toBeLessThanOrEqual(after + offset);
  });

  it('상태 변경·담당자 배정 Activity 를 각각 남긴다', async () => {
    await post();

    expect(mocks.activityCreate).toHaveBeenCalledTimes(2);
    expect(activityData(0)).toMatchObject({
      srId: 'sr-1',
      userId: 'mgr-1',
      type: 'STATUS_CHANGED',
    });
    expect(activityData(0).metadata).toMatchObject({
      previousStatus: 'REQUESTED',
      currentStatus: 'INTAKE',
      assigneeName: ASSIGNEE.name,
    });
    expect(activityData(1)).toMatchObject({ type: 'ASSIGNED' });
  });

  it('Activity 2건은 SR 수정과 같은 트랜잭션 안에서, 커밋 전에 만들어진다', async () => {
    await post();

    expect(order).toEqual(['tx:begin', 'sr.update', 'activity', 'activity', 'tx:commit']);
    expect(mocks.rootActivityCreate).not.toHaveBeenCalled();
  });

  it('Activity 생성이 실패하면 트랜잭션이 롤백되고 이벤트도 나가지 않는다', async () => {
    mocks.activityCreate.mockRejectedValue(new Error('activity insert failed'));

    const response = await post();

    expect(response.status).toBe(500);
    expect(order).toEqual(['tx:begin', 'sr.update', 'tx:rollback']);
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.emitRealtime).not.toHaveBeenCalled();
  });

  it('성공 응답은 성공 메시지와 갱신된 SR 을 담는다', async () => {
    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('SR이 성공적으로 접수되었습니다');
    expect(body.sr.status).toBe('INTAKE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET — 접수 정보 조회
// ═══════════════════════════════════════════════════════════════════════════

const GET_SR = {
  id: 'sr-1',
  clientId: 'client-1',
  requesterId: 'req-1',
  assigneeId: ASSIGNEE.id,
  srNumber: 'SR-20260801-0001',
  title: '테스트 SR',
  description: '설명',
  status: 'INTAKE',
  requestedPriority: 'MEDIUM',
  requestedCompletionDate: new Date('2026-08-20T00:00:00.000Z'),
  actualPriority: 'HIGH',
  intakeNotes: '메모',
  estimatedHours: 8,
  estimatedCompletionDate: new Date('2026-08-05T00:00:00.000Z'),
  dueDate: new Date('2026-08-02T00:00:00.000Z'),
  intakeAt: new Date('2026-08-01T00:00:00.000Z'),
  client: { id: 'client-1', code: 'C1', name: '고객사' },
  requester: { id: 'req-1', name: '요청자', email: 'req@example.com' },
  assignee: ASSIGNEE,
  intakeBy: { id: 'mgr-1', name: '매니저', email: 'mgr@example.com' },
  serviceCategory: {
    id: 'cat-1',
    categoryName: '일반',
    slaHours: 24,
    handlerId: 'eng-1',
    handler: { id: 'eng-1', name: '담당 엔지니어' },
  },
  attachments: [] as unknown[],
};

describe('GET /api/srs/[id]/intake', () => {
  it('SR 이 없으면 404 다', async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await get();

    expect(response.status).toBe(404);
  });

  it('조회 권한이 없는 사용자는 403 이다', async () => {
    mocks.findUnique.mockResolvedValue(GET_SR);

    const response = await get(
      session({ id: 'out-1', roles: ['CLIENT_USER'], permissions: [], clientIds: ['client-9'] })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('SR 조회 권한이 없습니다.');
  });

  it.each([
    ['ADMIN', session({ id: 'a', roles: ['ADMIN'], permissions: [], clientIds: [] })],
    [
      'MANAGER(SR:READ)',
      session({ id: 'm', roles: ['MANAGER'], permissions: ['SR:READ'], clientIds: [] }),
    ],
    [
      '배정된 ENGINEER',
      session({ id: ASSIGNEE.id, roles: ['ENGINEER'], permissions: ['SR:READ'], clientIds: [] }),
    ],
    [
      '소속 고객사 사용자',
      session({
        id: 'c',
        roles: ['CLIENT_USER'],
        permissions: ['SR:READ'],
        clientIds: ['client-1'],
      }),
    ],
  ])('%s 는 조회할 수 있다', async (_label, sess) => {
    mocks.findUnique.mockResolvedValue(GET_SR);

    const response = await get(sess);

    expect(response.status).toBe(200);
  });

  it('배정되지 않은 ENGINEER 는 조회할 수 없다', async () => {
    mocks.findUnique.mockResolvedValue(GET_SR);

    const response = await get(
      session({ id: 'eng-99', roles: ['ENGINEER'], permissions: ['SR:READ'], clientIds: [] })
    );

    expect(response.status).toBe(403);
  });

  it('첨부의 BigInt fileSize 를 숫자로 직렬화한다 (미변환 시 500)', async () => {
    mocks.findUnique.mockResolvedValue({
      ...GET_SR,
      attachments: [
        {
          id: 'att-1',
          fileName: 'spec.pdf',
          fileSize: BigInt(10_485_760),
          fileType: 'application/pdf',
          fileUrl: '/uploads/spec.pdf',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
    });

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attachments[0].fileSize).toBe(10_485_760);
    expect(typeof body.attachments[0].fileSize).toBe('number');
    expect(body.attachments[0].createdAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('첨부가 없는 SR 도 정상 직렬화된다', async () => {
    mocks.findUnique.mockResolvedValue(GET_SR);

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attachments).toEqual([]);
    expect(body.intakeAt).toBe('2026-08-01T00:00:00.000Z');
    expect(body.assignee.id).toBe(ASSIGNEE.id);
  });

  it('담당자·접수자가 비어 있어도 null 로 응답한다', async () => {
    mocks.findUnique.mockResolvedValue({
      ...GET_SR,
      assigneeId: null,
      assignee: null,
      intakeBy: null,
      intakeAt: null,
      estimatedCompletionDate: null,
    });

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assignee).toBeNull();
    expect(body.intakeBy).toBeNull();
    expect(body.intakeAt).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH — 접수 정보 수정
// ═══════════════════════════════════════════════════════════════════════════

const PATCH_SR = {
  id: 'sr-1',
  srNumber: 'SR-20260801-0001',
  title: '테스트 SR',
  status: 'INTAKE',
  clientId: 'client-1',
  requesterId: 'req-1',
  assigneeId: ASSIGNEE.id,
  actualPriority: 'MEDIUM',
  estimatedHours: 4,
  estimatedCompletionDate: new Date('2026-08-05T00:00:00.000Z'),
  intakeNotes: '기존 메모',
  dueDate: new Date('2026-08-02T00:00:00.000Z'),
  intakeAt: new Date('2026-08-01T00:00:00.000Z'),
  serviceCategory: { id: 'cat-1', slaHours: 24 },
  assignee: ASSIGNEE,
};

const patchSR = (overrides: Record<string, unknown> = {}) => ({ ...PATCH_SR, ...overrides });

describe('PATCH /api/srs/[id]/intake — 권한 게이트', () => {
  beforeEach(() => {
    mocks.findUnique.mockResolvedValue(patchSR());
  });

  it.each([
    ['ADMIN', ['ADMIN'], 200],
    ['MANAGER', ['MANAGER'], 200],
    ['ADMIN+MANAGER', ['MANAGER', 'ADMIN'], 200],
    ['ENGINEER', ['ENGINEER'], 403],
    ['CLIENT_USER', ['CLIENT_USER'], 403],
  ])('%s → %d', async (_label, roles, expected) => {
    const response = await patch(
      { actualPriority: 'HIGH' },
      session({ id: 'u-1', name: '유저', email: 'u@example.com', roles: roles as string[] })
    );

    expect(response.status).toBe(expected);
  });

  it('roles 가 없는 세션은 403 이다', async () => {
    const response = await patch({ actualPriority: 'HIGH' }, session({ id: 'u-1' }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('MANAGER 또는 ADMIN 권한이 필요합니다');
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/srs/[id]/intake — 수정 필드 유무', () => {
  beforeEach(() => {
    mocks.findUnique.mockResolvedValue(patchSR());
  });

  it('빈 바디는 400 이다', async () => {
    const response = await patch({});
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('수정할 정보를 최소 하나 이상 입력해주세요.');
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  // hasAnyField 의 다섯 항 각각이 단독으로 게이트를 통과시켜야 한다.
  it.each([
    ['actualPriority', { actualPriority: 'HIGH' }],
    ['estimatedHours', { estimatedHours: 12 }],
    ['estimatedCompletionDate', { estimatedCompletionDate: '2026-08-09T00:00:00.000Z' }],
    ['intakeNotes', { intakeNotes: '새 메모' }],
    ['assigneeId', { assigneeId: OTHER_ASSIGNEE.id }],
  ])('%s 만 있어도 통과한다', async (_label, body) => {
    const response = await patch(body);

    expect(response.status).toBe(200);
  });

  it('알 수 없는 값은 스키마가 거른다', async () => {
    const response = await patch({ actualPriority: 'URGENT' });

    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/srs/[id]/intake — 상태 게이트', () => {
  it('SR 이 없으면 404 다', async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await patch({ actualPriority: 'HIGH' });

    expect(response.status).toBe(404);
  });

  it.each(['INTAKE', 'IN_PROGRESS'])('status %s 는 수정할 수 있다', async (status) => {
    mocks.findUnique.mockResolvedValue(patchSR({ status }));

    const response = await patch({ actualPriority: 'HIGH' });

    expect(response.status).toBe(200);
    // 낙관적 락 가드는 스냅샷 상태로 매칭한다
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sr-1', status } })
    );
  });

  it.each(['REQUESTED', 'ON_HOLD', 'COMPLETED', 'CONFIRMED', 'REJECTED'])(
    'status %s 는 400 이다',
    async (status) => {
      mocks.findUnique.mockResolvedValue(patchSR({ status }));

      const response = await patch({ actualPriority: 'HIGH' });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('접수되었거나 진행 중인 SR만 접수 정보를 수정할 수 있습니다');
      expect(mocks.transaction).not.toHaveBeenCalled();
    }
  );

  it('가드가 0건이면 409 이고 update 를 실행하지 않는다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const response = await patch({ actualPriority: 'HIGH' });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('다른 사용자가 먼저 이 SR을 변경했습니다');
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/srs/[id]/intake — SLA 재계산', () => {
  it('우선순위가 바뀌면 intakeAt 기준으로 마감일을 다시 계산한다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR({ actualPriority: 'MEDIUM' }));

    await patch({ actualPriority: 'CRITICAL' });

    // intakeAt 2026-08-01T00:00Z + 24h × 0.5 = 12h
    expect(lastUpdateData().dueDate).toEqual(new Date('2026-08-01T12:00:00.000Z'));
  });

  it('우선순위가 같으면 마감일을 건드리지 않는다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR({ actualPriority: 'MEDIUM' }));

    await patch({ actualPriority: 'MEDIUM' });

    expect(lastUpdateData().dueDate).toBeUndefined();
    expect(lastUpdateData().actualPriority).toBe('MEDIUM');
  });

  it('우선순위를 보내지 않으면 마감일을 건드리지 않는다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());

    await patch({ estimatedHours: 12 });

    expect(lastUpdateData().dueDate).toBeUndefined();
    expect(lastUpdateData().actualPriority).toBeUndefined();
  });

  it('intakeAt 이 없으면 현재 시각을 기준으로 계산한다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR({ intakeAt: null, actualPriority: 'MEDIUM' }));

    const before = Date.now();
    await patch({ actualPriority: 'LOW' });
    const after = Date.now();

    // 24h × 1.5 = 36h
    const dueDate: Date = lastUpdateData().dueDate;
    expect(dueDate.getTime()).toBeGreaterThanOrEqual(before + 36 * HOUR);
    expect(dueDate.getTime()).toBeLessThanOrEqual(after + 36 * HOUR);
  });
});

describe('PATCH /api/srs/[id]/intake — 필드별 부분 수정', () => {
  it('보낸 필드만 update data 에 실린다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());

    await patch({ estimatedHours: 12 });

    expect(lastUpdateData()).toEqual({ estimatedHours: 12 });
  });

  it('actualPriority 는 실효 우선순위(priority)도 함께 옮긴다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());

    await patch({ actualPriority: 'HIGH' });

    expect(lastUpdateData().actualPriority).toBe('HIGH');
    expect(lastUpdateData().priority).toBe('HIGH');
  });

  it('estimatedCompletionDate 는 Date 로 변환해 저장한다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());

    await patch({ estimatedCompletionDate: '2026-08-09T00:00:00.000Z' });

    expect(lastUpdateData().estimatedCompletionDate).toEqual(new Date('2026-08-09T00:00:00.000Z'));
  });

  it.each([
    ['빈 문자열', '', null],
    ['null', null, null],
    ['문자열', '새 메모', '새 메모'],
  ])('intakeNotes %s → %s', async (_label, intakeNotes, expected) => {
    mocks.findUnique.mockResolvedValue(patchSR());

    await patch({ intakeNotes });

    expect(lastUpdateData().intakeNotes).toBe(expected);
  });
});

describe('PATCH /api/srs/[id]/intake — 담당자 변경', () => {
  it('담당자가 바뀌면 assertAssignable 로 검증한다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());
    mocks.assertAssignable.mockResolvedValue(OTHER_ASSIGNEE);

    const response = await patch({ assigneeId: OTHER_ASSIGNEE.id });

    expect(response.status).toBe(200);
    expect(mocks.assertAssignable).toHaveBeenCalledWith(OTHER_ASSIGNEE.id);
    expect(lastUpdateData().assigneeId).toBe(OTHER_ASSIGNEE.id);
  });

  it('같은 담당자를 다시 보내면 검증도 배정 이벤트도 없다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());

    const response = await patch({ assigneeId: ASSIGNEE.id });

    expect(response.status).toBe(200);
    expect(mocks.assertAssignable).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('담당자를 보내지 않으면 배정 경로를 타지 않는다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());

    await patch({ estimatedHours: 12 });

    expect(mocks.assertAssignable).not.toHaveBeenCalled();
    expect(lastUpdateData().assigneeId).toBeUndefined();
  });

  it('담당자 검증 실패는 그대로 전파되고 update 가 일어나지 않는다', async () => {
    const { NotFoundError } = await import('@/lib/errors');
    mocks.findUnique.mockResolvedValue(patchSR());
    mocks.assertAssignable.mockRejectedValue(new NotFoundError('담당자'));

    const response = await patch({ assigneeId: OTHER_ASSIGNEE.id });

    expect(response.status).toBe(404);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('기존 담당자가 없으면 이력에 "미배정" 으로 남는다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR({ assigneeId: null, assignee: null }));
    mocks.assertAssignable.mockResolvedValue(OTHER_ASSIGNEE);

    await patch({ assigneeId: OTHER_ASSIGNEE.id });

    const assignActivity = mocks.activityCreate.mock.calls
      .map((call) => call[0]?.data)
      .find((data: any) => data?.type === 'ASSIGNED');

    expect(assignActivity.description).toBe(
      `담당자가 변경되었습니다: 미배정 → ${OTHER_ASSIGNEE.name}`
    );
    expect(assignActivity.metadata.previousAssigneeName).toBeNull();
    expect(assignActivity.metadata.newAssigneeName).toBe(OTHER_ASSIGNEE.name);
  });

  // 담당자 "해제"는 아직 구현돼 있지 않다: intakeUpdateSchema 의 assigneeId 가
  // `z.string().min(1).optional()` (nullable 아님) 이라 null 도 빈 문자열도 검증 단계에서
  // 막히고, use-intake-form.ts 의 폼 스키마도 같아 UI 에 '미배정' 선택지가 없다.
  // 라우트에 깔려 있던 해제 분기는 그래서 도달 불가능한 죽은 코드였고 제거했다.
  // 아래 두 테스트는 스키마 쪽 사실을 그대로 고정한다 — 스키마는 바꾸지 않았기 때문이다.
  // 해제를 지원하게 되면 이 테스트가 빨간불이 되어 "양쪽 스키마 + UI + 라우트 분기"를
  // 함께 손봐야 한다는 신호가 된다.
  it.each([
    ['null', null],
    ['빈 문자열', ''],
  ])(
    'assigneeId %s 은(는) 스키마가 거부한다 — 담당자 해제는 미구현',
    async (_label, assigneeId) => {
      mocks.findUnique.mockResolvedValue(patchSR());

      const response = await patch({ assigneeId });

      expect(response.status).toBe(400);
      expect(mocks.txUpdate).not.toHaveBeenCalled();
    }
  );

  it('해제 분기가 사라져도 배정 경로의 저장 값·이력·이벤트는 그대로다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());
    mocks.assertAssignable.mockResolvedValue(OTHER_ASSIGNEE);

    const response = await patch({ assigneeId: OTHER_ASSIGNEE.id });
    const body = await response.json();

    expect(lastUpdateData()).toEqual({ assigneeId: OTHER_ASSIGNEE.id });
    expect(body.changes).toEqual([`담당자: ${ASSIGNEE.name} → ${OTHER_ASSIGNEE.name}`]);
    expect(activityData(0).metadata.newValues).toEqual({
      assigneeId: OTHER_ASSIGNEE.id,
      assigneeName: OTHER_ASSIGNEE.name,
    });
    expect(activityData(1)).toMatchObject({
      type: 'ASSIGNED',
      metadata: {
        previousAssigneeId: ASSIGNEE.id,
        previousAssigneeName: ASSIGNEE.name,
        newAssigneeId: OTHER_ASSIGNEE.id,
        newAssigneeName: OTHER_ASSIGNEE.name,
      },
    });
  });

  it('기존 담당자가 있으면 이름이 이력에 실린다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());
    mocks.assertAssignable.mockResolvedValue(OTHER_ASSIGNEE);

    await patch({ assigneeId: OTHER_ASSIGNEE.id });

    expect(mocks.emit).toHaveBeenCalledWith(
      'sr:assigned',
      expect.objectContaining({
        srId: 'sr-1',
        assigneeId: OTHER_ASSIGNEE.id,
        assigneeName: OTHER_ASSIGNEE.name,
      })
    );
  });
});

describe('PATCH /api/srs/[id]/intake — 변경 이력', () => {
  it('실제로 달라진 값만 changes 에 담긴다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());

    const response = await patch({
      actualPriority: 'HIGH',
      estimatedHours: 12,
      estimatedCompletionDate: '2026-08-09T00:00:00.000Z',
      intakeNotes: '수정된 메모',
    });
    const body = await response.json();

    expect(body.changes).toEqual([
      '우선순위: MEDIUM → HIGH',
      '예상 작업 시간: 4시간 → 12시간',
      '예상 완료일 변경',
      '접수 메모 수정',
    ]);
    expect(body.message).toBe('접수 정보가 성공적으로 수정되었습니다');
  });

  it('기존 예상 시간이 없으면 "미정" 으로 표기한다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR({ estimatedHours: null }));

    const response = await patch({ estimatedHours: 12 });
    const body = await response.json();

    expect(body.changes).toEqual(['예상 작업 시간: 미정시간 → 12시간']);
  });

  it('기존 예상 완료일이 없으면 변경으로 집계된다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR({ estimatedCompletionDate: null }));

    const response = await patch({ estimatedCompletionDate: '2026-08-09T00:00:00.000Z' });
    const body = await response.json();

    expect(body.changes).toEqual(['예상 완료일 변경']);
  });

  it('값이 같으면 changes 도 Activity 도 실시간 이벤트도 없다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());

    const response = await patch({
      actualPriority: 'MEDIUM',
      estimatedHours: 4,
      estimatedCompletionDate: '2026-08-05T00:00:00.000Z',
      intakeNotes: '기존 메모',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.changes).toBeUndefined();
    expect(mocks.activityCreate).not.toHaveBeenCalled();
    expect(mocks.emitRealtime).not.toHaveBeenCalled();
  });

  it('변경이 있으면 INTAKE_UPDATED Activity 와 실시간 이벤트를 남긴다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());

    await patch({ actualPriority: 'HIGH' });

    expect(activityData(0)).toMatchObject({
      srId: 'sr-1',
      userId: 'mgr-1',
      type: 'INTAKE_UPDATED',
    });
    expect(activityData(0).metadata.updatedBy).toBe('매니저');
    expect(activityData(0).metadata.newValues).toEqual({ actualPriority: 'HIGH' });
    expect(mocks.emitRealtime).toHaveBeenCalledWith(
      'sr:updated',
      expect.objectContaining({ id: 'sr-1', actorId: 'mgr-1' })
    );
  });

  it('이름이 없는 사용자는 이메일로 기록된다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());

    await patch(
      { actualPriority: 'HIGH' },
      session({ id: 'u-9', name: null, email: 'noname@example.com', roles: ['ADMIN'] })
    );

    expect(activityData(0).metadata.updatedBy).toBe('noname@example.com');
  });

  it('메모만 바뀌면 메모 변경 하나만 집계된다', async () => {
    mocks.findUnique.mockResolvedValue(patchSR());

    const response = await patch({ intakeNotes: null });
    const body = await response.json();

    expect(body.changes).toEqual(['접수 메모 수정']);
    expect(activityData(0).metadata.newValues).toEqual({ intakeNotes: null });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 원자성 회귀 — PATCH 의 활동 이력이 트랜잭션 밖에 있던 버그
//
// POST 는 "부분 기록이 남지 않도록" 상태 변경 + 이력 + 활동을 한 트랜잭션에서 커밋하는데,
// 같은 파일의 PATCH 만 `tx.sR.update` 뒤 **커밋 이후**에 `prisma.sRActivity.create` 를
// 호출했다. 그 호출이 실패하면 SR 은 이미 바뀐 채 활동 이력만 사라진다 —
// POST 가 막겠다고 선언한 바로 그 상태다. 아래 테스트가 그 비대칭을 잠근다.
// ───────────────────────────────────────────────────────────────────────────

describe('PATCH /api/srs/[id]/intake — 활동 이력의 원자성', () => {
  beforeEach(() => {
    mocks.findUnique.mockResolvedValue(patchSR());
  });

  it('활동 이력은 트랜잭션 안에서, SR 수정 뒤 커밋 전에 만들어진다', async () => {
    mocks.assertAssignable.mockResolvedValue(OTHER_ASSIGNEE);

    await patch({ actualPriority: 'HIGH', assigneeId: OTHER_ASSIGNEE.id });

    // INTAKE_UPDATED + ASSIGNED 두 건 모두 커밋(tx:commit) 앞에 있어야 한다.
    expect(order).toEqual(['tx:begin', 'sr.update', 'activity', 'activity', 'tx:commit']);
    expect(mocks.activityCreate).toHaveBeenCalledTimes(2);
    // 트랜잭션 밖(prisma.sRActivity.create)에서는 단 한 건도 만들지 않는다.
    expect(mocks.rootActivityCreate).not.toHaveBeenCalled();
  });

  it('INTAKE_UPDATED 활동 생성이 실패하면 SR 수정도 롤백된다', async () => {
    mocks.activityCreate.mockRejectedValue(new Error('activity insert failed'));

    const response = await patch({ actualPriority: 'HIGH' });

    expect(response.status).toBe(500);
    // 커밋되지 않았다 = tx.sR.update 도 되돌아간다
    expect(order).toEqual(['tx:begin', 'sr.update', 'tx:rollback']);
    expect(order).not.toContain('tx:commit');
  });

  it('ASSIGNED 활동 생성이 실패해도 SR 수정과 앞선 활동이 함께 롤백된다', async () => {
    mocks.assertAssignable.mockResolvedValue(OTHER_ASSIGNEE);
    mocks.activityCreate
      .mockImplementationOnce(async () => {
        order.push('activity');
        return {};
      })
      .mockRejectedValueOnce(new Error('assign activity insert failed'));

    const response = await patch({ actualPriority: 'HIGH', assigneeId: OTHER_ASSIGNEE.id });

    expect(response.status).toBe(500);
    expect(order).toEqual(['tx:begin', 'sr.update', 'activity', 'tx:rollback']);
  });

  it('트랜잭션이 롤백되면 배정·실시간 이벤트가 발행되지 않는다', async () => {
    mocks.assertAssignable.mockResolvedValue(OTHER_ASSIGNEE);
    mocks.activityCreate.mockRejectedValue(new Error('activity insert failed'));

    await patch({ assigneeId: OTHER_ASSIGNEE.id });

    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.emitRealtime).not.toHaveBeenCalled();
  });

  it('이벤트는 커밋 이후에 발행된다', async () => {
    mocks.assertAssignable.mockResolvedValue(OTHER_ASSIGNEE);
    mocks.emit.mockImplementation(() => order.push('emit'));
    mocks.emitRealtime.mockImplementation(() => order.push('realtime'));

    await patch({ assigneeId: OTHER_ASSIGNEE.id });

    expect(order.indexOf('tx:commit')).toBeLessThan(order.indexOf('emit'));
    expect(order.indexOf('tx:commit')).toBeLessThan(order.indexOf('realtime'));
  });

  it('변경이 없으면 트랜잭션은 돌지만 활동은 만들지 않는다', async () => {
    const response = await patch({ actualPriority: 'MEDIUM' });

    expect(response.status).toBe(200);
    expect(order).toEqual(['tx:begin', 'sr.update', 'tx:commit']);
    expect(mocks.activityCreate).not.toHaveBeenCalled();
    expect(mocks.rootActivityCreate).not.toHaveBeenCalled();
  });
});
