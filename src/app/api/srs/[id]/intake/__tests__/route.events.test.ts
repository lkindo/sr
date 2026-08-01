/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 3.21 회귀 테스트.
 *
 * 접수(intake) 라우트는 SR 을 REQUESTED → INTAKE 로 바꾸고 담당자를 배정하는데,
 * 도메인 이벤트도 실시간 이벤트도 전혀 발행하지 않았다. 그 결과
 * **배정된 담당자가 자기에게 일이 왔다는 사실을 전혀 통보받지 못했고**,
 * 다른 세션의 목록도 갱신되지 않았다. PATCH 경로에는 "새 담당자에게만 메일 발송"
 * 이라는 주석만 있고 구현이 아예 없었다.
 */

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  emitRealtime: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  activityCreate: vi.fn(),
  updateMany: vi.fn(),
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
    sR: { findUnique: mocks.findUnique, updateMany: mocks.updateMany, update: vi.fn() },
    sRActivity: { create: mocks.activityCreate },
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

vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return { ...actual, ensureCanReadSR: vi.fn() };
});

import { POST } from '../route';

const ASSIGNEE = { id: 'eng-1', name: '담당 엔지니어', email: 'eng@example.com', isActive: true };

const EXISTING_SR = {
  id: 'sr-1',
  srNumber: 'SR-20260801-0001',
  title: '테스트 SR',
  status: 'REQUESTED',
  clientId: 'client-1',
  requesterId: 'req-1',
  assigneeId: null,
  serviceCategory: { id: 'cat-1', slaHours: 24 },
  client: { id: 'client-1', name: '고객사' },
  requester: { id: 'req-1', name: '요청자', email: 'req@example.com' },
};

const UPDATED_SR = {
  ...EXISTING_SR,
  status: 'INTAKE',
  assigneeId: ASSIGNEE.id,
};

const SESSION = {
  user: {
    id: 'mgr-1',
    name: '매니저',
    email: 'mgr@example.com',
    roles: ['MANAGER'],
    permissions: [],
    clientIds: [],
  },
};

const VALID_BODY = {
  actualPriority: 'HIGH',
  estimatedHours: 8,
  estimatedCompletionDate: '2026-08-05T00:00:00.000Z',
  assigneeId: ASSIGNEE.id,
  intakeNotes: '접수 완료',
};

const post = async (body: unknown = VALID_BODY) =>
  (POST as any)(
    new NextRequest('http://localhost:3000/api/srs/sr-1/intake', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    { session: SESSION, params: Promise.resolve({ id: 'sr-1' }) }
  );

describe('POST /api/srs/[id]/intake — 이벤트 발행', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(EXISTING_SR);
    mocks.assertAssignable.mockResolvedValue(ASSIGNEE);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.activityCreate.mockResolvedValue({});
    // 트랜잭션 콜백에 tx 스텁을 주입하고 갱신된 SR 을 돌려준다.
    mocks.transaction.mockImplementation(async (cb: any) =>
      cb({
        sR: { updateMany: mocks.updateMany, update: vi.fn().mockResolvedValue(UPDATED_SR) },
        sRActivity: { create: mocks.activityCreate },
      })
    );
  });

  it('접수 성공 시 상태 변경 이벤트를 발행한다 (요청자 알림)', async () => {
    const response = await post();
    expect(response.status).toBe(200);

    expect(mocks.emit).toHaveBeenCalledWith(
      'sr:status_changed',
      expect.objectContaining({
        srId: 'sr-1',
        srNumber: 'SR-20260801-0001',
        requesterId: 'req-1',
        previousStatus: 'REQUESTED',
        currentStatus: 'INTAKE',
      })
    );
  });

  it('접수 성공 시 배정 이벤트를 발행한다 (담당자 알림)', async () => {
    await post();

    expect(mocks.emit).toHaveBeenCalledWith(
      'sr:assigned',
      expect.objectContaining({
        srId: 'sr-1',
        assigneeId: ASSIGNEE.id,
        assigneeName: ASSIGNEE.name,
      })
    );
  });

  it('실시간 이벤트로 다른 세션의 목록을 갱신시킨다', async () => {
    await post();

    expect(mocks.emitRealtime).toHaveBeenCalledWith(
      'sr:updated',
      expect.objectContaining({
        id: 'sr-1',
        status: 'INTAKE',
        // SSE 권한 필터링·본인 에코 방지용 키
        clientId: 'client-1',
        requesterId: 'req-1',
        assigneeId: ASSIGNEE.id,
        actorId: 'mgr-1',
      })
    );
  });

  it('이벤트는 트랜잭션 커밋 이후에 발행된다', async () => {
    const order: string[] = [];
    mocks.transaction.mockImplementation(async (cb: any) => {
      order.push('transaction');
      return cb({
        sR: { updateMany: mocks.updateMany, update: vi.fn().mockResolvedValue(UPDATED_SR) },
        sRActivity: { create: mocks.activityCreate },
      });
    });
    mocks.emit.mockImplementation(() => order.push('emit'));

    await post();

    // 롤백된 트랜잭션에 대해 알림이 나가면 안 된다.
    expect(order[0]).toBe('transaction');
    expect(order).toContain('emit');
  });

  it('이미 접수된 SR 이면 이벤트를 발행하지 않는다', async () => {
    mocks.findUnique.mockResolvedValue({ ...EXISTING_SR, status: 'INTAKE' });

    const response = await post();

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.emitRealtime).not.toHaveBeenCalled();
  });

  it('권한이 없으면 이벤트를 발행하지 않는다', async () => {
    const response = await (POST as any)(
      new NextRequest('http://localhost:3000/api/srs/sr-1/intake', {
        method: 'POST',
        body: JSON.stringify(VALID_BODY),
        headers: { 'Content-Type': 'application/json' },
      }),
      {
        session: {
          user: { id: 'u-1', roles: ['CLIENT_USER'], permissions: ['SR:CREATE'], clientIds: [] },
        },
        params: Promise.resolve({ id: 'sr-1' }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.emit).not.toHaveBeenCalled();
  });
});
