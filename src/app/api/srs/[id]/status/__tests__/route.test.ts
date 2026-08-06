/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `/api/srs/[id]/status` 전이 사전조건 계약.
 *
 * 이 라우트만 갖고 있는 두 규칙 — **7일 재오픈 창**과 **요청자 전용 확인** — 은
 * 상태머신에도 `updateSR` 에도 없다(감사 4.3). 즉 이 파일이 그 규칙의 유일한 구현이고,
 * 테스트가 하나도 없었다. 여기가 깨지면 CONFIRMED 가 사실상 비종단 상태가 된다.
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

describe('재오픈 7일 창', () => {
  it('완료 후 7일이 지나면 거부한다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'COMPLETED', completedAt: daysAgo(8) }));

    const res = await call({ action: 'reopen', reason: '재작업 필요' });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('7일');
    expect(mocks.updateSR).not.toHaveBeenCalled();
  });

  it('7일 이내면 허용한다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'COMPLETED', completedAt: daysAgo(3) }));

    const res = await call({ action: 'reopen', reason: '재작업 필요' });

    expect(res.status).toBe(200);
    expect(mocks.updateSR).toHaveBeenCalledWith(
      'sr-1',
      expect.objectContaining({ status: 'IN_PROGRESS' }),
      expect.anything()
    );
  });

  it('CONFIRMED 도 같은 창을 적용받는다', async () => {
    mocks.getSRById.mockResolvedValue(sr({ status: 'CONFIRMED', completedAt: daysAgo(30) }));

    const res = await call({ action: 'reopen', reason: '재작업 필요' });

    expect(res.status).toBe(400);
  });

  it('completedAt 이 없으면 창 검사를 건너뛴다', async () => {
    // 완료 시각을 모르면 막을 근거가 없다. 이 분기가 사라지면 legacy 데이터가 전부 막힌다.
    mocks.getSRById.mockResolvedValue(sr({ status: 'COMPLETED', completedAt: null }));

    const res = await call({ action: 'reopen', reason: '재작업 필요' });

    expect(res.status).toBe(200);
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

    // 사유·해결내용이 필요한 액션에는 함께 넣는다(그 검사는 별도 테스트가 다룬다).
    const res = await call({
      action,
      reason: '사유',
      resolutionDescription: '해결 내용',
    });

    expect(res.status).toBe(expected);
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
