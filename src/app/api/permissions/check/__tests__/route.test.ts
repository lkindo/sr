import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock 함수들을 hoisted로 선언
const mockCheckPermission = vi.fn();

// PermissionService mock
vi.mock('@/services/permission.service', () => ({
    PermissionService: class {
        checkPermission = mockCheckPermission;
    },
}));

// auth-wrapper mock - 핸들러를 감싸서 session 주입
vi.mock('@/lib/auth-wrapper', () => ({
    withAuthAndRateLimit: (handler: any) => {
        return async (request: NextRequest, context?: any) => {
            const session = context?.session || {
                user: { id: 'mock-user-id' }
            };
            return handler(request, { session, ...context });
        };
    },
}));

// errors mock
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

// route 모듈은 mock 설정 후에 import
// route 모듈은 테스트 내부에서 dynamic import 사용

describe('POST /api/permissions/check', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return hasPermission true when service approves', async () => {
        // Arrange
        mockCheckPermission.mockResolvedValue(true);

        const requestBody = { resource: 'SR', action: 'CREATE' };
        const request = new NextRequest('http://localhost/api/permissions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        // Act
        const { POST } = await import('../route');
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
        const request = new NextRequest('http://localhost/api/permissions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

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
        const request = new NextRequest('http://localhost/api/permissions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        // Act & Assert
        const { POST } = await import('../route');
        await expect(
            POST(request, { session: { user: { id: 'user123' } } } as any)
        ).rejects.toThrow('리소스와 액션을 제공해야 합니다');
    });

    it('action이 없으면 BadRequestError를 던져야 함', async () => {
        // Arrange
        const requestBody = { resource: 'SR' }; // action 누락
        const request = new NextRequest('http://localhost/api/permissions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        // Act & Assert
        const { POST } = await import('../route');
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

            const request = new NextRequest('http://localhost/api/permissions/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resource: testCase.resource, action: testCase.action }),
            });

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
