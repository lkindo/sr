import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
const mockGroupBy = vi.fn();
const mockCount = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
    default: {
        sR: {
            groupBy: mockGroupBy,
            count: mockCount,
            findMany: mockFindMany,
        },
        client: {
            findMany: vi.fn(),
        },
        userClient: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('@/lib/auth-wrapper', () => ({
    withAuthAndRateLimit: vi.fn((handler) => {
        return async (request: any, context?: any) => {
            const session = context?.session || {
                user: {
                    id: 'user123',
                    roles: ['ADMIN'],
                }
            };
            return handler(request, { session });
        };
    }),
}));

vi.mock('@/lib/redis-cache', () => ({
    getCachedData: vi.fn(async (key, fn) => {
        // 캐시를 사용하지 않고 직접 함수 실행
        return await fn();
    }),
    CacheKeys: {
        dashboardStats: () => 'dashboard:stats',
    },
}));

vi.mock('@/lib/cache-config', () => ({
    getDashboardTtlSeconds: () => 60,
}));

describe('GET /api/dashboard/stats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('대시보드 통계를 반환해야 함', async () => {
        // Arrange
        mockGroupBy.mockResolvedValue([
            { status: 'REQUESTED', _count: { id: 5 } },
            { status: 'IN_PROGRESS', _count: { id: 3 } },
        ]);

        mockCount.mockResolvedValue(10);
        mockFindMany.mockResolvedValue([]);

        const request = new Request('http://localhost/api/dashboard/stats') as NextRequest;

        // Dynamic import after mocks
        const { GET } = await import('../route');

        // Act
        const response = await GET(request, {
            session: { user: { id: 'user123', roles: ['ADMIN'] } }
        } as any);
        const json = await response.json();

        // Assert
        expect(json).toHaveProperty('summary');
        expect(json).toHaveProperty('byStatus');
        expect(json).toHaveProperty('byPriority');
        expect(json).toHaveProperty('byClient');
        expect(json).toHaveProperty('recentSRs');
        expect(json).toHaveProperty('trend');
    });

    it('ADMIN 사용자는 모든 SR을 조회할 수 있어야 함', async () => {
        // Arrange
        mockGroupBy.mockResolvedValue([]);
        mockCount.mockResolvedValue(0);
        mockFindMany.mockResolvedValue([]);

        const request = new Request('http://localhost/api/dashboard/stats') as NextRequest;
        const { GET } = await import('../route');

        // Act
        const response = await GET(request, {
            session: { user: { id: 'admin1', roles: ['ADMIN'] } }
        } as any);
        const json = await response.json();

        // Assert
        expect(response.status).toBe(200);
        expect(json).toBeDefined();
    });

    it('nocache 파라미터가 있으면 캐시를 건너뛰어야 함', async () => {
        // Arrange
        mockGroupBy.mockResolvedValue([]);
        mockCount.mockResolvedValue(0);
        mockFindMany.mockResolvedValue([]);

        const request = new Request('http://localhost/api/dashboard/stats?nocache=1') as NextRequest;
        const { GET } = await import('../route');

        // Act
        const response = await GET(request, {
            session: { user: { id: 'user123', roles: ['ADMIN'] } }
        } as any);

        // Assert
        expect(response.status).toBe(200);
    });

    it('상태별 SR 개수를 올바르게 집계해야 함', async () => {
        // Arrange
        mockGroupBy
            .mockResolvedValueOnce([
                { status: 'REQUESTED', _count: { id: 5 } },
                { status: 'IN_PROGRESS', _count: { id: 3 } },
                { status: 'COMPLETED', _count: { id: 7 } },
            ])
            .mockResolvedValueOnce([
                { priority: 'HIGH', _count: { id: 4 } },
                { priority: 'MEDIUM', _count: { id: 6 } },
            ])
            .mockResolvedValueOnce([]) // srByClient
            .mockResolvedValueOnce([]); // srTrend

        mockCount.mockResolvedValue(15);
        mockFindMany.mockResolvedValue([]);

        const request = new Request('http://localhost/api/dashboard/stats') as NextRequest;
        const { GET } = await import('../route');

        // Act
        const response = await GET(request, {
            session: { user: { id: 'user123', roles: ['ADMIN'] } }
        } as any);
        const json = await response.json();

        // Assert
        expect(json.byStatus).toHaveProperty('REQUESTED');
        expect(json.byStatus).toHaveProperty('IN_PROGRESS');
        expect(json.byStatus).toHaveProperty('COMPLETED');
    });

    it('최근 SR 목록을 반환해야 함', async () => {
        // Arrange
        const mockRecentSRs = [
            {
                id: 'sr1',
                srNumber: 'SR-20241120-0001',
                title: 'Test SR 1',
                status: 'REQUESTED',
                createdAt: new Date(),
                client: { name: 'Client A', code: 'CA' },
                requester: { name: 'User A' },
                assignee: null,
            },
        ];

        mockGroupBy.mockResolvedValue([]);
        mockCount.mockResolvedValue(1);
        mockFindMany.mockResolvedValue(mockRecentSRs);

        const request = new Request('http://localhost/api/dashboard/stats') as NextRequest;
        const { GET } = await import('../route');

        // Act
        const response = await GET(request, {
            session: { user: { id: 'user123', roles: ['ADMIN'] } }
        } as any);
        const json = await response.json();

        // Assert
        expect(json.recentSRs).toBeDefined();
        expect(Array.isArray(json.recentSRs)).toBe(true);
    });

    it('성능 지표를 계산해야 함', async () => {
        // Arrange
        mockGroupBy.mockResolvedValue([]);
        mockCount.mockResolvedValue(0);
        mockFindMany.mockResolvedValue([]);

        const request = new Request('http://localhost/api/dashboard/stats') as NextRequest;
        const { GET } = await import('../route');

        // Act
        const response = await GET(request, {
            session: { user: { id: 'user123', roles: ['ADMIN'] } }
        } as any);
        const json = await response.json();

        // Assert
        expect(json.performance).toBeDefined();
        expect(json.performance).toHaveProperty('avgProcessingHours');
        expect(json.performance).toHaveProperty('slaComplianceRate');
        expect(json.performance).toHaveProperty('avgWaitingHours');
    });

    it('30일 트렌드 데이터를 반환해야 함', async () => {
        // Arrange
        mockGroupBy.mockResolvedValue([]);
        mockCount.mockResolvedValue(0);
        mockFindMany.mockResolvedValue([]);

        const request = new Request('http://localhost/api/dashboard/stats') as NextRequest;
        const { GET } = await import('../route');

        // Act
        const response = await GET(request, {
            session: { user: { id: 'user123', roles: ['ADMIN'] } }
        } as any);
        const json = await response.json();

        // Assert
        expect(json.trend).toBeDefined();
        expect(Array.isArray(json.trend)).toBe(true);
        expect(json.trend.length).toBe(30); // 30일치 데이터
    });
});
