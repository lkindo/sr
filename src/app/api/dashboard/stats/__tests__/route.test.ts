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
  },
}));

vi.mock('@/lib/redis-cache', () => ({
  CacheKeys: { dashboardStats: () => 'dashboard:stats' },
  getCachedData: vi.fn((key, fetcher) => fetcher()), // Bypass cache
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
      .mockResolvedValueOnce([{ clientId: 'c-1', _count: { id: 5 } }] as any)
      // 4. Trend (By Date)
      .mockResolvedValueOnce([{ createdAt: new Date(), _count: { id: 5 } }] as any);

    vi.mocked(prisma.sR.count).mockResolvedValue(8);
    vi.mocked(prisma.sR.findMany).mockResolvedValue([]); // For recent/waiting lists
    vi.mocked(prisma.client.findMany).mockResolvedValue([
      { id: 'c-1', name: 'Client 1', code: 'C1' },
    ] as any);

    const req = new NextRequest('http://localhost/api/dashboard/stats');
    const response = await GET(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.summary.total).toBe(8);
    expect(json.byStatus['REQUESTED']).toBe(5);
  });
});
