import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

// Hoist mocks to ensure availability before import
const mocks = vi.hoisted(() => ({
    getAllSRs: vi.fn(),
    createSR: vi.fn(),
    count: vi.fn(),
    checkPermission: vi.fn(),
    withAuthAndRateLimit: (handler: any) => async (req: any, ctx: any = {}) => {
        const session = ctx.session || { user: { id: 'user1', roles: ['ADMIN'] } };
        return handler(req, { session });
    },
    sendSRCreatedEmail: vi.fn().mockResolvedValue(true)
}));

vi.mock('@/services/sr.service', () => ({
    SRService: class {
        getAllSRs = mocks.getAllSRs;
        createSR = mocks.createSR;
    }
}));

vi.mock('@/services/permission.service', () => ({
    PermissionService: class {
        checkPermission = mocks.checkPermission;
    }
}));

vi.mock('@/lib/prisma', () => ({
    default: {
        sR: { count: mocks.count },
        user: { findMany: vi.fn().mockResolvedValue([]) }
    }
}));

vi.mock('@/lib/auth-wrapper', () => ({
    withAuthAndRateLimit: mocks.withAuthAndRateLimit
}));

vi.mock('@/lib/cache', () => ({
    isCacheAvailable: () => false,
    withCache: vi.fn(),
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
    sendSRCreatedEmail: mocks.sendSRCreatedEmail
}));

describe('API: /api/srs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET', () => {
        it('should return list of SRs with pagination', async () => {
            const mockSRs = [{ id: 'sr1', title: 'Test SR' }];
            mocks.getAllSRs.mockResolvedValue(mockSRs);
            mocks.count.mockResolvedValue(1);

            const req = new NextRequest('http://localhost/api/srs?page=1&pageSize=10');
            const res = await GET(req);
            const json = await res.json();

            expect(json.data).toEqual(mockSRs);
            expect(json.meta.totalItems).toBe(1); // Fixed expectation
        });

        it('should apply filters', async () => {
            mocks.getAllSRs.mockResolvedValue([]);
            mocks.count.mockResolvedValue(0);

            const req = new NextRequest('http://localhost/api/srs?status=REQUESTED');
            await GET(req);

            expect(mocks.getAllSRs).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ status: 'REQUESTED' })
            }));
        });
    });

    describe('POST', () => {
        it('should create SR if authorized', async () => {
            mocks.checkPermission.mockResolvedValue(true);
            const newSR = { id: 'sr1', title: 'New SR' };
            mocks.createSR.mockResolvedValue(newSR);

            const req = new NextRequest('http://localhost/api/srs', {
                method: 'POST',
                body: JSON.stringify({ title: 'New SR' })
            });

            const res = await POST(req);
            expect(res.status).toBe(201);
            const json = await res.json();
            expect(json).toEqual(newSR);
        });

        it('should throw Forbidden if unauthorized', async () => {
            mocks.checkPermission.mockResolvedValue(false);

            const req = new NextRequest('http://localhost/api/srs', {
                method: 'POST',
                body: JSON.stringify({ title: 'New SR' })
            });

            await expect(POST(req)).rejects.toThrow('SR 등록 권한이 없습니다');
        });
    });
});
