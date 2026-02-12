import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError } from '@/lib/errors';

// Hoist mock functions
const { mockGetAllUsers, mockCreateUser, mockHandleApiError } = vi.hoisted(() => ({
  mockGetAllUsers: vi.fn(),
  mockCreateUser: vi.fn(),
  mockHandleApiError: vi.fn((error) => {
    const status = error.statusCode || 500;
    return NextResponse.json({ error: error.message || 'Error' }, { status });
  }),
}));

// Mock api-error-handler
vi.mock('@/lib/api-error-handler', () => ({
  handleApiError: mockHandleApiError,
}));

// Mock auth-wrapper - Implementation that actually calls the handler
// We will mock the session dynamically in the tests
vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: vi.fn((handler) => {
    return async (req: any, context: any) => {
      try {
        // The session will be injected via context in our test setup
        // or we can just mock it here if we want to test specific scenarios
        // But since we want to vary the session per test, we rely on the test passing the session in context
        return await handler(req, context);
      } catch (error) {
        return mockHandleApiError(error);
      }
    };
  }),
}));

// Mock UserService
vi.mock('@/services/user.service', () => ({
  UserService: class {
    getAllUsers = mockGetAllUsers;
    createUser = mockCreateUser;
  },
}));

// Mock policies
vi.mock('@/lib/policies', async () => {
  const actual = await vi.importActual('@/lib/policies');
  return {
    ...actual,
    ensureCanReadUser: vi.fn((user) => {
      // Simple mock implementation of the policy
      const isAdmin = user.roles.includes('ADMIN');
      const canViewAll = user.permissions.includes('USER:READ');

      if (!isAdmin && !canViewAll) {
         throw new ForbiddenError('사용자 조회 권한이 없습니다.');
      }
    }),
    ensureCanCreateUser: vi.fn((user) => {
      const isAdmin = user.roles.includes('ADMIN');
      const canCreate = user.permissions.includes('USER:CREATE');

      if (!isAdmin && !canCreate) {
         throw new ForbiddenError('사용자 생성 권한이 없습니다.');
      }
    }),
  };
});

import { GET, POST } from '../route';

describe('API Route: /api/users (Security)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow ADMIN to access user list', async () => {
    mockGetAllUsers.mockResolvedValue({ data: [], total: 0 });

    const req = new NextRequest('http://localhost/api/users');
    const context = {
      session: {
        user: { id: 'admin-1', roles: ['ADMIN'], permissions: [] },
      },
    };

    const res = await GET(req, context as any);

    expect(res.status).toBe(200);
    expect(mockGetAllUsers).toHaveBeenCalled();
  });

  it('should allow user with USER:READ permission to access user list', async () => {
    mockGetAllUsers.mockResolvedValue({ data: [], total: 0 });

    const req = new NextRequest('http://localhost/api/users');
    const context = {
      session: {
        user: { id: 'manager-1', roles: ['MANAGER'], permissions: ['USER:READ'] },
      },
    };

    const res = await GET(req, context as any);

    expect(res.status).toBe(200);
    expect(mockGetAllUsers).toHaveBeenCalled();
  });

  it('should DENY user without permissions to access user list', async () => {
    // Current implementation ignores policy, so this might PASS (status 200) if vulnerable
    // We expect it to FAIL (throw ForbiddenError -> 403) after we fix it.
    // In this test, we are asserting the DESIRED behavior.

    mockGetAllUsers.mockResolvedValue({ data: [], total: 0 });

    const req = new NextRequest('http://localhost/api/users');
    const context = {
      session: {
        user: { id: 'user-1', roles: ['CLIENT_USER'], permissions: [] }, // No permissions
      },
    };

    const res = await GET(req, context as any);

    // Check if handleApiError was called with ForbiddenError or status is 403
    // Since we mocked handleApiError to return JSON with status from error
    // ForbiddenError usually has statusCode 403

    if (res.status === 200) {
        throw new Error('Security Vulnerability: Unauthorized user was able to access user list');
    }

    expect(res.status).toBe(403);
    expect(mockGetAllUsers).not.toHaveBeenCalled();
  });

  describe('POST', () => {
    it('should DENY user without permissions to create user', async () => {
        const req = new NextRequest('http://localhost/api/users', {
            method: 'POST',
            body: JSON.stringify({ email: 'test@test.com' }),
        });
        const context = {
            session: {
                user: { id: 'user-1', roles: ['CLIENT_USER'], permissions: [] }, // No permissions
            },
        };

        const res = await POST(req, context as any);

        if (res.status === 201) {
            throw new Error('Security Vulnerability: Unauthorized user was able to create user');
        }

        expect(res.status).toBe(403);
    });
  });
});
