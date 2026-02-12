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

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => async (req: any) => {
    // Mock session injection
    return handler(req, { session: { user: { id: 'user-1', roles: ['MANAGER'] } } });
  },
}));

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
      .mockResolvedValueOnce([
        { avgProcessingHours: 2.5, slaComplianceRate: 95.5 },
      ] as any);
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
});
