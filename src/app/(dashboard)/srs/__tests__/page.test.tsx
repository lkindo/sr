import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /srs 서버 컴포넌트의 '지연 중' 필터와 배지 집계 기준(헌법 §3, 2026-09-18 소유자 결정 D10).
 *
 * 대시보드 '지연 중 N건' 카드를 누르면 /srs?overdue=1 로 온다. 숫자와 목록이 맞으려면 이 필터가
 * 대시보드 집계와 같은 범위(진행 중 상태이면서 마감을 넘긴 SR)여야 한다. '오늘 마감' 배지는 지금
 * 이후만 센다 — 예전에는 오늘 0시부터 세서 이미 지난 SR 을 섞었다.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAllSRs: vi.fn(),
  countSRs: vi.fn(),
  getSRBadgeCounts: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/components/srs/SRsDataTable', () => ({ SRsDataTable: () => null }));
vi.mock('@/lib/cache', () => ({
  getCachedClients: vi.fn().mockResolvedValue([]),
  getCachedAssignableUsers: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/sr.service', () => ({
  srService: {
    getAllSRs: mocks.getAllSRs,
    countSRs: mocks.countSRs,
    getSRBadgeCounts: mocks.getSRBadgeCounts,
  },
}));

import SRsPage from '../page';

const render = (searchParams: Record<string, string>) =>
  SRsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    user: { id: 'mgr-1', roles: ['MANAGER'], permissions: ['SR:READ'], clientIds: [] },
  });
  mocks.getAllSRs.mockResolvedValue([]);
  mocks.countSRs.mockResolvedValue(0);
  mocks.getSRBadgeCounts.mockResolvedValue({});
});

describe('SRsPage — 지연 중 필터(D10)', () => {
  it('overdue=1 이면 진행 중 상태이면서 마감을 넘긴 SR 만 거른다', async () => {
    const before = Date.now();
    await render({ overdue: '1' });

    const { where } = mocks.getAllSRs.mock.calls[0]![0];
    const [dueCondition, statusCondition] = where.AND;
    expect(statusCondition).toEqual({ status: { in: ['INTAKE', 'IN_PROGRESS', 'ON_HOLD'] } });
    expect(dueCondition.dueDate.lt).toBeInstanceOf(Date);
    expect(dueCondition.dueDate.lt.getTime()).toBeGreaterThanOrEqual(before);
    // 목록 개수도 같은 조건으로 센다 — 페이지 수가 숫자와 맞아야 한다.
    expect(mocks.countSRs.mock.calls[0]![0].where).toEqual(where);
  });

  it('상태 필터와 함께 쓰면 둘 다 만족하는 건만 거른다', async () => {
    await render({ overdue: '1', status: 'ON_HOLD' });

    const { where } = mocks.getAllSRs.mock.calls[0]![0];
    expect(where.status).toBe('ON_HOLD');
    expect(where.AND).toHaveLength(2);
  });

  it('overdue 가 없으면 마감 조건을 걸지 않는다', async () => {
    await render({});

    expect(mocks.getAllSRs.mock.calls[0]![0].where.AND).toBeUndefined();
  });

  it("배지 집계는 '지금'을 경계로 넘긴다 — 오늘 마감은 지금 이후, 지연은 지금 이전", async () => {
    const before = Date.now();
    await render({});

    const params = mocks.getSRBadgeCounts.mock.calls[0]![0];
    expect(params.now.getTime()).toBeGreaterThanOrEqual(before);
    expect(params.dueTo.getTime()).toBeGreaterThan(params.now.getTime());
    expect(params).not.toHaveProperty('dueFrom');
  });
});
