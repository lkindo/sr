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
    // Setup mocks for GroupBy (Status)
    vi.mocked(prisma.sR.groupBy)
      .mockResolvedValueOnce([
        { status: 'IN_PROGRESS', _count: { id: 2 } },
        { status: 'COMPLETED', _count: { id: 3 } },
        { status: 'REQUESTED', _count: { id: 1 } },
        { status: 'REJECTED', _count: { id: 4 } }, // Total 10
      ] as any)
      // Setup mocks for GroupBy (Priority)
      .mockResolvedValueOnce([
        { priority: 'CRITICAL', _count: { id: 1 } },
        { priority: 'MEDIUM', _count: { id: 9 } },
      ] as any)
      // Setup mocks for GroupBy (Client)
      .mockResolvedValueOnce([
        { clientId: 'c1', _count: { id: 5 } },
      ] as any);

    // Setup mocks for MyAssigned counts (Engineer)
    vi.mocked(prisma.sR.count)
      .mockResolvedValueOnce(2) // myAssignedSRs
      .mockResolvedValueOnce(1); // myAssignedInProgress

    vi.mocked(prisma.sR.findMany).mockResolvedValue([]);
    vi.mocked(prisma.client.findMany).mockResolvedValue([]);

    // Mock $queryRaw to return Trend then Stats (No Counts query anymore)
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ date: '2023-10-01', count: 5 }] as any) // Trend query
      .mockResolvedValueOnce([{ avgProcessingHours: 2.5, slaComplianceRate: 95.5 }] as any); // Stats query

    const req = new NextRequest('http://localhost/api/dashboard/stats');
    const response = await GET(req, { params: Promise.resolve({}) });
    const json = await response.json();

    expect(response.status).toBe(200);

    // Verify optimization
    // We expect sR.count to be called 2 times for ENGINEER (my assigned counts)
    expect(prisma.sR.count).toHaveBeenCalledTimes(2);

    // We expect $queryRaw to be called 2 times (Trend, Stats) instead of 3
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);

    // Verify values
    expect(json.summary.total).toBe(10);
    expect(json.summary.inProgress).toBe(2);
    expect(json.summary.completed).toBe(3);
    expect(json.summary.requested).toBe(1);
    expect(json.summary.pending).toBe(1); // REQUESTED + INTAKE(0)
    expect(json.summary.urgent).toBe(1); // CRITICAL + HIGH(0)
    expect(json.summary.myAssigned).toBe(2);
    expect(json.summary.myAssignedInProgress).toBe(1);
  });
});
