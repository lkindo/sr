import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/dashboard/stats/route';
import prisma from '@/lib/prisma';

// Force node runtime for testing
vi.mock('@/lib/prisma', () => ({
  default: {
    userClient: { findMany: vi.fn() },
    sR: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    client: { findMany: vi.fn() },
    serviceCategory: { findMany: vi.fn() },
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

const session = vi.hoisted(() => ({
  user: { id: 'user-1', roles: ['MANAGER'] as string[], permissions: [] as string[] },
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => async (req: any) => {
    // Mock session injection
    return handler(req, { session });
  },
}));

/** 통계 API 가 부르는 조회 목을 한 번에 채운다. counts 는 집계 쿼리(#3)의 한 줄이다. */
function mockStatsQueries(counts: Record<string, number>) {
  vi.mocked(prisma.sR.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.$queryRaw)
    .mockResolvedValueOnce([counts] as never)
    .mockResolvedValueOnce([] as never)
    .mockResolvedValueOnce([{ avgProcessingHours: 0, slaComplianceRate: null }] as never);
  vi.mocked(prisma.sR.findMany).mockResolvedValue([]);
  vi.mocked(prisma.client.findMany).mockResolvedValue([] as never);
}

describe('Dashboard Stats API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return stats for MANAGER', async () => {
    // Mock data
    // 1. By Status
    vi.mocked(prisma.sR.groupBy)
      .mockResolvedValueOnce([
        { status: 'REQUESTED', _count: { id: 5 } },
        { status: 'IN_PROGRESS', _count: { id: 3 } },
      ] as any)
      // 2. By Priority
      .mockResolvedValueOnce([{ priority: 'HIGH', _count: { id: 5 } }] as any)
      // 3. By Client
      .mockResolvedValueOnce([{ clientId: 'c-1', _count: { id: 5 } }] as any);

    // 4. Counts Query + Trend (By Date) - Raw Query
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([
        {
          totalSRs: 8,
          inProgressSRs: 8,
          completedSRs: 8,
          pendingSRs: 8,
          requestedSRs: 8,
          urgentSRs: 8,
          myAssignedSRs: 0,
          myAssignedInProgress: 0,
        },
      ] as any)
      .mockResolvedValueOnce([
        { date: new Date().toISOString().split('T')[0], count: BigInt(5) },
      ] as any)
      .mockResolvedValueOnce([{ avgProcessingHours: 2.5, slaComplianceRate: 95.5 }] as any);
    vi.mocked(prisma.sR.findMany).mockResolvedValue([]); // For recent/waiting lists
    vi.mocked(prisma.client.findMany).mockResolvedValue([
      { id: 'c-1', name: 'Client 1', code: 'C1' },
    ] as any);

    const req = new NextRequest('http://localhost/api/dashboard/stats');
    const response = await GET(req, { params: Promise.resolve({}) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.summary.total).toBe(8);
    expect(json.byStatus['REQUESTED']).toBe(5);
  });

  /**
   * '지연 중'(헌법 §3, 2026-09-18 소유자 결정 D10). 준수율은 끝난 SR 만 세는 후행 지표라 적체가 쌓이는
   * 동안에도 높게 유지된다. 마감을 넘긴 진행 중 SR 건수가 짝을 이루는 선행 지표다.
   */
  it('지연 중·그중 보류·마감 직접 조정 건수를 내려보낸다', async () => {
    mockStatsQueries({ totalSRs: 20, overdueSRs: 12, overdueOnHoldSRs: 3, manualDueOpenSRs: 2 });

    const response = await GET(new NextRequest('http://localhost/api/dashboard/stats'), {
      params: Promise.resolve({}),
    });
    const json = await response.json();

    expect(json.summary).toMatchObject({ overdue: 12, overdueOnHold: 3, manualDueOpen: 2 });
  });

  it('지연 중은 진행 중 상태(접수·진행중·보류)이면서 마감을 넘긴 SR 로 센다', async () => {
    mockStatsQueries({});

    await GET(new NextRequest('http://localhost/api/dashboard/stats'), {
      params: Promise.resolve({}),
    });

    const [strings, ...values] = vi.mocked(prisma.$queryRaw).mock.calls[0]! as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join('?');
    expect(sql).toContain(
      `COUNT(*) FILTER (WHERE status IN ('INTAKE', 'IN_PROGRESS', 'ON_HOLD') AND due_date < ?)::int as "overdueSRs"`
    );
    // 판정 시각은 요청 시점이다 — 고정값이면 시간이 지나도 숫자가 변하지 않는다.
    const cutoff = values.find((value) => value instanceof Date) as Date;
    expect(Math.abs(cutoff.getTime() - Date.now())).toBeLessThan(5_000);
  });

  it('엔지니어의 "내 담당 SR" 은 끝나지 않은 SR 만 보인다', async () => {
    session.user = { id: 'eng-1', roles: ['ENGINEER'], permissions: [] };
    try {
      mockStatsQueries({});

      await GET(new NextRequest('http://localhost/api/dashboard/stats'), {
        params: Promise.resolve({}),
      });

      // 상태 조건이 없으면 마감이 이른 옛 완료 SR 이 5칸을 차지해 지금 지연 중인 SR 이 밀려났다.
      expect(prisma.sR.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assigneeId: 'eng-1',
            status: { notIn: ['COMPLETED', 'CONFIRMED', 'REJECTED'] },
          }),
        })
      );
    } finally {
      session.user = { id: 'user-1', roles: ['MANAGER'], permissions: [] };
    }
  });
});
