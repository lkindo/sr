/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `/api/srs/[id]/status` 전이 사전조건 계약.
 *
 * **2026-08-15 변경**: 7일 재오픈 창은 더 이상 이 라우트에 없다.
 * 예전에는 라우트가 자체 사본을 들고 있었고, 그 사본이 CONFIRMED 출발에도 `completedAt` 을
 * 보고 `completedAt` 이 NULL 이면 통과시켰다(fail-open). 사본을 두면 두 곳 중 하나만
 * 고쳐지므로 판정을 `validateTransition` 한 곳으로 모았다 —
 * 창 규칙의 계약은 `src/lib/__tests__/sr-state-machine.*.test.ts` 가 검증한다.
 *
 * 이 파일이 지키는 것은 **라우트가 자체 판정 없이 위임하는가**와, 라우트에만 있는
 * 액션별 사전조건(출발 상태·필수 입력)이다.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSRById: vi.fn(),
  updateSR: vi.fn().mockResolvedValue({ id: 'sr-1', status: 'IN_PROGRESS' }),
}));

vi.mock('@/services/sr.service', () => ({
  srService: { getSRById: mocks.getSRById, updateSR: mocks.updateSR },
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => handler,
}));

import { PATCH } from '../route';

const REQUESTER_ID = 'user-requester';

function sr(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sr-1',
    status: 'IN_PROGRESS',
    requesterId: REQUESTER_ID,
    completedAt: null,
    ...overrides,
  };
}

const ctx = (userId = 'user-admin') => ({
  session: { user: { id: userId, roles: ['ADMIN'], permissions: [], clientIds: [] } },
  params: Promise.resolve({ id: 'sr-1' }),
});

const call = (body: unknown, userId?: string) =>
  (PATCH as any)(
    new NextRequest('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    ctx(userId)
  );

/** 며칠 전 시각. */
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateSR.mockResolvedValue({ id: 'sr-1', status: 'IN_PROGRESS' });
});

describe('재오픈 — 라우트는 창 판정을 위임한다', () => {
  it('사유가 없으면 라우트가 먼저 거부한다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'COMPLETED', completedAt: daysAgo(3) }));

    const res = await call({ action: 'reopen' });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('재오픈 사유');
    expect(mocks.updateSR).not.toHaveBeenCalled();
  });

  it('완료/확인완료가 아닌 상태에서는 거부한다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'IN_PROGRESS' }));

    const res = await call({ action: 'reopen', reason: '재작업 필요' });

    expect(res.status).toBe(400);
    expect(mocks.updateSR).not.toHaveBeenCalled();
  });

  it('사전조건을 통과하면 창 판정은 updateSR 에 맡긴다', async () => {
    // 라우트는 7일을 세지 않는다. 8일 지난 SR 도 여기서는 통과하고,
    // 실제 거부는 updateSR 안의 validateTransition 이 한다.
    // (라우트가 자체 사본을 다시 갖게 되면 이 단언이 깨진다.)
    mocks.getSRById.mockResolvedValue(sr({ status: 'COMPLETED', completedAt: daysAgo(8) }));

    const res = await call({ action: 'reopen', reason: '재작업 필요' });

    expect(res.status).toBe(200);
    expect(mocks.updateSR).toHaveBeenCalledWith(
      'sr-1',
      expect.objectContaining({ status: 'IN_PROGRESS' }),
      expect.anything()
    );
  });

  it('사유 없이는 재오픈할 수 없다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'COMPLETED', completedAt: daysAgo(1) }));

    const res = await call({ action: 'reopen' });

    expect(res.status).toBe(400);
    expect(mocks.updateSR).not.toHaveBeenCalled();
  });

  it('완료/확인 상태가 아니면 재오픈할 수 없다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'IN_PROGRESS' }));

    const res = await call({ action: 'reopen', reason: '사유' });

    expect(res.status).toBe(400);
  });
});

describe('확인(confirm)은 요청자 전용', () => {
  it('요청자 본인은 확인할 수 있다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'COMPLETED' }));

    const res = await call({ action: 'confirm' }, REQUESTER_ID);

    expect(res.status).toBe(200);
  });

  it('ADMIN 이라도 요청자가 아니면 403 이다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'COMPLETED' }));

    // 확인은 고객의 인수 행위다. 운영자가 대신 눌러 주면 인수 기록이 거짓이 된다.
    const res = await call({ action: 'confirm' }, 'user-admin');

    expect(res.status).toBe(403);
    expect(mocks.updateSR).not.toHaveBeenCalled();
  });

  it('완료 상태가 아니면 확인할 수 없다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'IN_PROGRESS' }));

    const res = await call({ action: 'confirm' }, REQUESTER_ID);

    expect(res.status).toBe(400);
  });
});

describe('나머지 전이 사전조건', () => {
  it.each([
    ['start', 'REQUESTED', 400],
    ['start', 'INTAKE', 200],
    ['complete', 'INTAKE', 400],
    ['hold', 'INTAKE', 400],
    ['hold', 'IN_PROGRESS', 200],
    ['resume', 'IN_PROGRESS', 400],
    ['resume', 'ON_HOLD', 200],
    ['reject', 'COMPLETED', 400],
    ['reject', 'REQUESTED', 200],
  ])('%s 액션은 %s 상태에서 %d 를 반환한다', async (action, status, expected) => {
    mocks.getSRById.mockResolvedValue(sr({ status }));

    // 사유·해결내용·예상 해제일이 필요한 액션에는 함께 넣는다
    // (각 필수 검사는 별도 테스트가 다룬다).
    const res = await call({
      action,
      reason: '사유',
      resolutionDescription: '해결 내용',
      expectedHoldReleaseDate: '2026-09-01',
    });

    expect(res.status).toBe(expected);
  });

  // 헌법 §2: 보류는 사유 **와** 예상 해제일을 함께 명시한다.
  it('보류에는 예상 해제일이 필수다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'IN_PROGRESS' }));

    const res = await call({ action: 'hold', reason: '고객 자료 대기' });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('예상 해제일');
    expect(mocks.updateSR).not.toHaveBeenCalled();
  });

  it('보류 해제(resume)는 예상 해제일을 비운다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'ON_HOLD' }));

    const res = await call({ action: 'resume' });

    expect(res.status).toBe(200);
    // null 은 "약속을 지운다"는 의미 있는 값이다. truthy 검사로 걸러지면
    // 진행중 SR 에 유효하지 않은 해제 예정일이 남는다.
    expect(mocks.updateSR).toHaveBeenCalledWith(
      'sr-1',
      expect.objectContaining({ expectedHoldReleaseDate: null }),
      expect.anything()
    );
  });

  it('완료에는 해결 내용이 필수다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'IN_PROGRESS' }));

    const res = await call({ action: 'complete' });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('해결 내용');
  });

  it('거절에는 사유가 필수다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'REQUESTED' }));

    const res = await call({ action: 'reject' });

    expect(res.status).toBe(400);
  });

  it('보류에는 사유가 필수다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'IN_PROGRESS' }));

    const res = await call({ action: 'hold' });

    expect(res.status).toBe(400);
  });
});

describe('입력 검증과 존재 확인', () => {
  it('SR 이 없으면 404 다', async () => {
    mocks.getSRById.mockResolvedValue(null);

    const res = await call({ action: 'start' });

    expect(res.status).toBe(404);
    expect(mocks.updateSR).not.toHaveBeenCalled();
  });

  it('알 수 없는 액션은 ZodError 로 끝난다(handleApiError 가 400 매핑)', async () => {
    mocks.getSRById.mockResolvedValue(sr());

    await expect(call({ action: 'destroy' })).rejects.toThrow();
    expect(mocks.updateSR).not.toHaveBeenCalled();
  });

  it('빈 본문은 거부한다', async () => {
    mocks.getSRById.mockResolvedValue(sr());

    const req = new NextRequest('http://localhost/x', {
      method: 'PATCH',
      body: '',
      headers: { 'content-type': 'application/json' },
    });

    await expect((PATCH as any)(req, ctx())).rejects.toThrow();
  });
});
