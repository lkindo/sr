import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { mockHandleApiError, mockSession } = vi.hoisted(() => ({
    mockHandleApiError: vi.fn((error) => {
        const status = error.statusCode || 500;
        return NextResponse.json({ error: error.message || 'Error' }, { status });
    }),
    mockSession: {
        user: { id: 'admin-1', roles: ['ADMIN'], permissions: [], clientIds: [] }
    } as any
}));

// Mock modules
vi.mock('@/lib/api-error-handler', () => ({
    handleApiError: mockHandleApiError,
}));

vi.mock('@/lib/auth-wrapper', () => ({
    withAuthAndRateLimit: vi.fn((handler) => {
        return async (req: any, context: any) => {
            try {
                return await handler(req, { ...context, session: mockSession });
            } catch (error) {
                return mockHandleApiError(error);
            }
        };
    }),
}));

vi.mock('@/lib/redis-cache', () => ({
    getCachedData: vi.fn((key, fn) => fn()),
    CacheKeys: {
        dashboardStats: () => 'stats'
    }
}));

vi.mock('@/lib/prisma', () => ({
    default: {
        userClient: { findMany: vi.fn().mockResolvedValue([]) },
        sR: {
            groupBy: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
        },
        client: { findMany: vi.fn().mockResolvedValue([]) },
    },
}));

vi.mock('@/lib/cache-config', () => ({
    getDashboardTtlSeconds: vi.fn(() => 60),
}));

import { GET } from '../route';
import prisma from '@/lib/prisma';

describe('API Route: /api/dashboard/stats (Integration)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default to ADMIN
        mockSession.user = { id: 'admin-1', roles: ['ADMIN'], permissions: [], clientIds: [] };
    });

    it('should return aggregated stats for ADMIN', async () => {
        vi.mocked(prisma.sR.groupBy).mockResolvedValueOnce([
            { status: 'COMPLETED', _count: { id: 10 } },
            { status: 'IN_PROGRESS', _count: { id: 5 } },
        ] as any);

        vi.mocked(prisma.sR.groupBy).mockResolvedValueOnce([
            { priority: 'HIGH', _count: { id: 3 } },
            { priority: 'MEDIUM', _count: { id: 12 } },
        ] as any);

        vi.mocked(prisma.sR.count).mockResolvedValue(15);

        const req = new NextRequest('http://localhost/api/dashboard/stats');
        const res = await GET(req, { params: Promise.resolve({}) } as any);

        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.byStatus).toEqual({ COMPLETED: 10, IN_PROGRESS: 5 });
    });

    it('should filter by clientId for non-admin users', async () => {
        // Switch to CLIENT role
        mockSession.user = { id: 'client-user', roles: ['USER'], permissions: [], clientIds: [] };

        vi.mocked(prisma.userClient.findMany).mockResolvedValue([{ clientId: 'client-1' }] as any);
        vi.mocked(prisma.sR.groupBy).mockResolvedValue([]);
        vi.mocked(prisma.sR.count).mockResolvedValue(0);

        const req = new NextRequest('http://localhost/api/dashboard/stats');
        const res = await GET(req, { params: Promise.resolve({}) } as any);

        expect(res.status).toBe(200);
        expect(prisma.userClient.findMany).toHaveBeenCalled();
    });
});
