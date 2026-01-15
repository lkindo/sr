import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Hoist mock functions
const { mockGetAllSRs, mockCreateSR, mockCheckPermission, mockHandleApiError } = vi.hoisted(() => ({
    mockGetAllSRs: vi.fn(),
    mockCreateSR: vi.fn(),
    mockCheckPermission: vi.fn(),
    mockHandleApiError: vi.fn((error) => {
        const status = error.statusCode || (error.name === 'ForbiddenError' ? 403 : 500);
        return NextResponse.json({ error: error.message || 'Error' }, { status });
    }),
}));

// Mock api-error-handler
vi.mock('@/lib/api-error-handler', () => ({
    handleApiError: mockHandleApiError,
}));

// Mock auth-wrapper
vi.mock('@/lib/auth-wrapper', () => ({
    withAuthAndRateLimit: vi.fn((handler) => {
        return async (req: any, context: any) => {
            try {
                const session = {
                    user: {
                        id: 'user-1',
                        email: 'test@example.com',
                        roles: [],
                        permissions: [],
                        clientIds: []
                    }
                };
                return await handler(req, { ...context, session });
            } catch (error) {
                return mockHandleApiError(error);
            }
        };
    }),
    withAuth: vi.fn((handler) => {
        return async (req: any, context: any) => {
            try {
                const session = {
                    user: {
                        id: 'user-1',
                        roles: [],
                        permissions: [],
                        clientIds: []
                    }
                };
                return await handler(req, { ...context, session });
            } catch (error) {
                return mockHandleApiError(error);
            }
        };
    }),
}));

// Mock services using classes
vi.mock('@/services/sr.service', () => ({
    SRService: class {
        getAllSRs = mockGetAllSRs;
        createSR = mockCreateSR;
    }
}));

vi.mock('@/services/permission.service', () => ({
    PermissionService: class {
        checkPermission = mockCheckPermission;
    }
}));

// Mock prisma
vi.mock('@/lib/prisma', () => ({
    default: {
        sR: { count: vi.fn() },
        user: { findMany: vi.fn().mockResolvedValue([]) },
    },
}));

// Mock cache
vi.mock('@/lib/cache', () => ({
    withCache: vi.fn((key, fn) => fn()),
    isCacheAvailable: vi.fn(() => false),
}));

// Mock serialization
vi.mock('@/lib/serialization', () => ({
    serializeResponse: vi.fn((data) => data),
}));

// Mock redis-cache for invalidation
vi.mock('@/lib/redis-cache', () => ({
    invalidateCachePattern: vi.fn(),
}));

// Mock cache-config
vi.mock('@/lib/cache-config', () => ({
    shouldWideInvalidate: vi.fn(() => false),
    getSrsListTtlSeconds: vi.fn(() => 3600),
}));

import { GET, POST } from '../route';
import prisma from '@/lib/prisma';

describe('API Route: /api/srs (Integration)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckPermission.mockResolvedValue(true);
    });

    describe('GET', () => {
        it('should return SR list with 200 OK', async () => {
            const mockSrs = [{ id: 'sr-1', title: 'Test SR' }];
            mockGetAllSRs.mockResolvedValue(mockSrs as any);
            vi.mocked(prisma.sR.count).mockResolvedValue(1);

            const req = new NextRequest('http://localhost/api/srs');
            const res = await GET(req, { params: Promise.resolve({}) } as any);

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.data).toEqual(mockSrs);
        });
    });

    describe('POST', () => {
        it('should create a new SR if user has permission', async () => {
            mockCheckPermission.mockResolvedValue(true);
            const mockSR = { id: 'sr-1', srNumber: 'SR-001', title: 'New SR' };
            mockCreateSR.mockResolvedValue(mockSR as any);

            const req = new NextRequest('http://localhost/api/srs', {
                method: 'POST',
                body: JSON.stringify({ title: 'New SR', description: 'desc' }),
            });

            const res = await POST(req, { params: Promise.resolve({}) } as any);

            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.id).toBe('sr-1');
            expect(mockCreateSR).toHaveBeenCalled();
        });

        it('should return 403 if user lacks permission', async () => {
            mockCheckPermission.mockResolvedValue(false);

            const req = new NextRequest('http://localhost/api/srs', {
                method: 'POST',
                body: JSON.stringify({ title: 'No Perm' }),
            });

            const res = await POST(req, { params: Promise.resolve({}) } as any);

            expect(res.status).toBe(403);
            expect(mockHandleApiError).toHaveBeenCalled();
        });
    });
});
