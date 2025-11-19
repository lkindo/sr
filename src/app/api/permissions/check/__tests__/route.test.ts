// vitest test for permission check API endpoint
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../route';
import { PermissionService } from '@/services/permission.service';
import { NextRequest } from 'next/server';

// Mock PermissionService
vi.mock('@/services/permission.service', () => ({
    PermissionService: vi.fn().mockImplementation(() => ({
        checkPermission: vi.fn().mockResolvedValue(true),
    })),
}));

// Mock auth-wrapper to bypass NextAuth/RateLimit
vi.mock('@/lib/auth-wrapper');

function mockRequest(body: any): NextRequest {
    const json = JSON.stringify(body);
    const request = new Request('http://localhost/api/permissions/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
    }) as unknown as NextRequest;
    return request;
}

describe('POST /api/permissions/check', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return hasPermission true when service approves', async () => {
        const req = mockRequest({ resource: 'SR', action: 'CREATE' });
        // auth-wrapper mock injects a session with user.id = "mock-user"
        const response = await POST(req, {} as any);
        const json = await response.json();
        expect(json).toEqual({ hasPermission: true });
        const mockInstance = (PermissionService as any).mock.instances[0];
        expect(mockInstance.checkPermission).toHaveBeenCalledWith('mock-user', 'SR:CREATE');
    });
});
