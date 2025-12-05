import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const permissionServiceMocks = vi.hoisted(() => {
    const mockCheckPermission = vi.fn();
    class PermissionServiceMock {
        checkPermission = mockCheckPermission;
    }
    return { mockCheckPermission, PermissionServiceMock };
});

const { mockCheckPermission, PermissionServiceMock } = permissionServiceMocks;

vi.mock('@/services/permission.service', () => ({
    PermissionService: PermissionServiceMock,
}));

// Mock auth-wrapper to return a simple handler
vi.mock('@/lib/auth-wrapper', () => ({
    withAuthAndRateLimit: vi.fn((handler) => {
        // Return a wrapper that injects session
        return async (request: any, context?: any) => {
            const session = context?.session || {
                user: { id: 'mock-user-id' }
            };
            return handler(request, { session });
        };
    }),
}));

// Mock errors
vi.mock('@/lib/errors', () => ({
    ForbiddenError: class ForbiddenError extends Error {
        statusCode = 403;
        constructor(message: string) {
            super(message);
            this.name = 'ForbiddenError';
        }
    },
    BadRequestError: class BadRequestError extends Error {
        statusCode = 400;
        constructor(message: string) {
            super(message);
            this.name = 'BadRequestError';
        }
    },
}));

describe('POST /api/permissions/check', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('권한이 있으면 hasPermission true를 반환해야 함', async () => {
        // Arrange
        mockCheckPermission.mockResolvedValue(true);

        const requestBody = { resource: 'SR', action: 'CREATE' };
        const request = new Request('http://localhost/api/permissions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        }) as NextRequest;

        // Dynamically import after mocks are set up
        const routeModule = await import('../route');
        const POST = routeModule.POST;

        // Act
        const response = await POST(request, { session: { user: { id: 'user123' } } } as any);
        const json = await response.json();

        // Assert
        expect(json).toEqual({ hasPermission: true });
        expect(mockCheckPermission).toHaveBeenCalledWith('user123', 'SR:CREATE');
    });

    it('권한이 없으면 hasPermission false를 반환해야 함', async () => {
        // Arrange
        mockCheckPermission.mockResolvedValue(false);

        const requestBody = { resource: 'USER', action: 'DELETE' };
        const request = new Request('http://localhost/api/permissions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        }) as NextRequest;

        const { POST } = await import('../route');

        // Act
        const response = await POST(request, { session: { user: { id: 'user123' } } } as any);
        const json = await response.json();

        // Assert
        expect(json).toEqual({ hasPermission: false });
        expect(mockCheckPermission).toHaveBeenCalledWith('user123', 'USER:DELETE');
    });

    it('resource가 없으면 BadRequestError를 던져야 함', async () => {
        // Arrange
        const requestBody = { action: 'CREATE' }; // resource 누락
        const request = new Request('http://localhost/api/permissions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        }) as NextRequest;

        const { POST } = await import('../route');

        // Act & Assert
        await expect(
            POST(request, { session: { user: { id: 'user123' } } } as any)
        ).rejects.toThrow('리소스와 액션을 제공해야 합니다');
    });

    it('action이 없으면 BadRequestError를 던져야 함', async () => {
        // Arrange
        const requestBody = { resource: 'SR' }; // action 누락
        const request = new Request('http://localhost/api/permissions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        }) as NextRequest;

        const { POST } = await import('../route');

        // Act & Assert
        await expect(
            POST(request, { session: { user: { id: 'user123' } } } as any)
        ).rejects.toThrow('리소스와 액션을 제공해야 합니다');
    });

    it('다양한 리소스와 액션 조합을 처리해야 함', async () => {
        // Arrange
        const testCases = [
            { resource: 'SR', action: 'READ', expected: true },
            { resource: 'CLIENT', action: 'UPDATE', expected: false },
            { resource: 'ROLE', action: 'DELETE', expected: true },
        ];

        const { POST } = await import('../route');

        for (const testCase of testCases) {
            mockCheckPermission.mockResolvedValue(testCase.expected);

            const request = new Request('http://localhost/api/permissions/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resource: testCase.resource, action: testCase.action }),
            }) as NextRequest;

            // Act
            const response = await POST(request, { session: { user: { id: 'user123' } } } as any);
            const json = await response.json();

            // Assert
            expect(json.hasPermission).toBe(testCase.expected);
            expect(mockCheckPermission).toHaveBeenCalledWith(
                'user123',
                `${testCase.resource}:${testCase.action}`
            );
        }
    });
});
