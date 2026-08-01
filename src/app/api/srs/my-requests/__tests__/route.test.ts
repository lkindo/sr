/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 3.40 회귀 테스트.
 *
 * 이 라우트는 `take`/`skip` 없이 요청자의 전체 SR 이력을 `description`(무제한 TEXT)
 * 까지 포함해 한 번에 힙으로 올리고, `total` 로 배열 길이를 돌려줬다.
 * 장기 사용자 한 명의 새로고침이 컨테이너 메모리를 고갈시킬 수 있었다.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    sR: {
      findMany: mocks.findMany,
      count: mocks.count,
      groupBy: mocks.groupBy,
    },
  },
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => (request: any) =>
    handler(request, { session: { user: { id: 'user-1' } } }),
}));

vi.mock('@/lib/serialization', () => ({
  serializeResponse: (data: any) => data,
}));

import { GET } from '../route';

const call = async (query = '') => {
  const response = await (GET as any)(
    new NextRequest(`http://localhost:3000/api/srs/my-requests${query}`)
  );
  return { response, body: await response.json() };
};

describe('GET /api/srs/my-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.groupBy.mockResolvedValue([]);
  });

  it('페이지네이션 없이도 take/skip 을 걸어 전체 이력을 힙에 올리지 않는다', async () => {
    await call();

    const args = mocks.findMany.mock.calls[0][0];
    expect(args.take).toBe(20);
    expect(args.skip).toBe(0);
  });

  it('page/pageSize 를 반영한다', async () => {
    await call('?page=3&pageSize=50');

    const args = mocks.findMany.mock.calls[0][0];
    expect(args.skip).toBe(100);
    expect(args.take).toBe(50);
  });

  it('pageSize 를 MAX_PAGE_SIZE(100) 로 제한한다', async () => {
    await call('?pageSize=100000');

    // 상한을 넘는 값은 스키마가 기본값으로 되돌린다 — 무제한 조회는 불가능해야 한다.
    expect(mocks.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(100);
  });

  it('무제한 TEXT 인 description 을 select 하지 않는다', async () => {
    await call();

    const select = mocks.findMany.mock.calls[0][0].select;
    expect(select.description).toBeUndefined();
    expect(select.title).toBe(true);
  });

  it('total 을 배열 길이가 아니라 실제 count 로 반환한다', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'sr-1', status: 'REQUESTED', createdAt: new Date() }]);
    mocks.count.mockResolvedValue(1234);

    const { body } = await call();

    expect(mocks.count).toHaveBeenCalledWith({ where: { requesterId: 'user-1' } });
    expect(body.meta.totalItems).toBe(1234);
    expect(body.data).toHaveLength(1);
  });

  it('요청자 본인의 SR 로만 범위를 제한한다', async () => {
    await call();

    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ requesterId: 'user-1' });
  });

  it('유효한 상태 필터를 where 에 반영한다', async () => {
    await call('?status=IN_PROGRESS');

    expect(mocks.findMany.mock.calls[0][0].where).toEqual({
      requesterId: 'user-1',
      status: 'IN_PROGRESS',
    });
  });

  it('알 수 없는 상태 값은 필터로 쓰지 않는다', async () => {
    await call('?status=NOT_A_STATUS');

    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ requesterId: 'user-1' });
  });

  it.each(['client', 'constructor', '__proto__', 'toString'])(
    "허용되지 않은 sortBy '%s' 는 기본 정렬로 되돌린다",
    async (sortBy) => {
      await call(`?sortBy=${encodeURIComponent(sortBy)}`);

      expect(mocks.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    }
  );

  it('허용된 sortBy 는 그대로 사용한다', async () => {
    await call('?sortBy=updatedAt');

    expect(mocks.findMany.mock.calls[0][0].orderBy).toEqual({ updatedAt: 'desc' });
  });

  it('통계는 현재 페이지가 아니라 요청자 전체 SR 기준으로 집계한다', async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.groupBy.mockResolvedValue([
      { status: 'REQUESTED', _count: { _all: 3 } },
      { status: 'IN_PROGRESS', _count: { _all: 2 } },
      { status: 'COMPLETED', _count: { _all: 4 } },
      { status: 'CONFIRMED', _count: { _all: 1 } },
      { status: 'REJECTED', _count: { _all: 5 } },
    ]);

    // 상태 필터가 걸려 있어도 통계는 전체 기준이어야 한다.
    const { body } = await call('?status=REQUESTED');

    expect(mocks.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requesterId: 'user-1' } })
    );
    expect(body.stats).toEqual({ total: 15, requested: 3, inProgress: 2, completed: 5 });
  });

  it('REQUESTED 인 SR 에만 대기 시간을 계산한다', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    mocks.findMany.mockResolvedValue([
      { id: 'a', status: 'REQUESTED', createdAt: twoHoursAgo },
      { id: 'b', status: 'COMPLETED', createdAt: twoHoursAgo },
    ]);

    const { body } = await call();

    expect(body.data[0].waitingHours).toBeCloseTo(2, 1);
    expect(body.data[0].progressPercentage).toBe(10);
    expect(body.data[1].waitingHours).toBe(0);
    expect(body.data[1].progressPercentage).toBe(100);
  });
});
