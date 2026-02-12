import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/dashboard/stats/route';
import prisma from '@/lib/prisma';

// Mock dependencies
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

// Mock auth to be an ENGINEER
vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => async (req: any) => {
    return handler(req, { session: { user: { id: 'user-1', roles: ['ENGINEER'] } } });
  },
}));

describe('Dashboard Stats API Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use single query for counts (Optimized)', async () => {
    // Setup mocks
    vi.mocked(prisma.sR.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.sR.findMany).mockResolvedValue([]);
    vi.mocked(prisma.client.findMany).mockResolvedValue([]);

    // Mock $queryRaw to return counts first, then trend data
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([
        {
          totalSRs: 10,
          inProgressSRs: 2,
          completedSRs: 3,
          pendingSRs: 1,
          requestedSRs: 1,
          urgentSRs: 1,
          myAssignedSRs: 2,
          myAssignedInProgress: 1
        }
      ] as any) // Counts query
      .mockResolvedValueOnce([
        { date: '2023-10-01', count: 5 }
      ] as any); // Trend query

    const req = new NextRequest('http://localhost/api/dashboard/stats');
    const response = await GET(req, { params: Promise.resolve({}) });
    const json = await response.json();

    expect(response.status).toBe(200);

    // Verify optimization
    expect(prisma.sR.count).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2); // One for counts, one for trend

    // Verify values
    expect(json.summary.total).toBe(10);
    expect(json.summary.inProgress).toBe(2);
  });
});
