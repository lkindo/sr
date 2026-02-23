import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mock functions
const { mockCreateUser, mockHandleApiError } = vi.hoisted(() => ({
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
vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: vi.fn((handler) => {
    return async (req: any, context: any) => {
      try {
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
    createUser = mockCreateUser;
  },
}));

// Mock policies - assume they pass for USER:CREATE
vi.mock('@/lib/policies', async () => {
  const actual = await vi.importActual('@/lib/policies');
  return {
    ...actual,
    ensureCanCreateUser: vi.fn(), // Always succeeds for this test
  };
});

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    role: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from '@/lib/prisma';

import { POST } from '../route';

describe('API Route: /api/users (Privilege Escalation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateUser.mockResolvedValue({ id: 'new-user', email: 'test@example.com' });
  });

  it('should DENY non-admin with USER:CREATE attempting to assign ADMIN role', async () => {
    // Setup: User has USER:CREATE but is NOT admin
    const session = {
      user: {
        id: 'user-1',
        roles: ['MANAGER'],
        permissions: ['USER:CREATE', 'ROLE:ASSIGN'], // Has ROLE:ASSIGN
      },
    };

    const req = new NextRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({
        email: 'attacker@evil.com',
        name: 'Attacker',
        password: 'StrongPassword123!',
        roleIds: ['admin-role-id'], // Trying to assign ADMIN role
      }),
    });

    // Mock Prisma to return ADMIN role
    vi.mocked(prisma.role.findMany).mockResolvedValue([
      { id: 'admin-role-id', name: 'ADMIN', description: 'Administrator' } as any,
    ]);

    const res = await POST(req, { session } as any);

    // EXPECTED BEHAVIOR: 403 Forbidden (Fix verified)
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/ADMIN 역할은 ADMIN만 할당할 수 있습니다/);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('should DENY user without ROLE:ASSIGN attempting to assign ANY role', async () => {
    // Setup: User has USER:CREATE but NO ROLE:ASSIGN
    const session = {
      user: {
        id: 'user-1',
        roles: ['MANAGER'],
        permissions: ['USER:CREATE'], // No ROLE:ASSIGN
      },
    };

    const req = new NextRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({
        email: 'user@example.com',
        name: 'User',
        password: 'StrongPassword123!',
        roleIds: ['some-role-id'],
      }),
    });

    const res = await POST(req, { session } as any);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/역할을 직접 할당할 권한이 없습니다/);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('should ALLOW user with ROLE:ASSIGN to assign NON-ADMIN roles', async () => {
    // Setup: User has ROLE:ASSIGN
    const session = {
      user: {
        id: 'user-1',
        roles: ['MANAGER'],
        permissions: ['USER:CREATE', 'ROLE:ASSIGN'],
      },
    };

    const req = new NextRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({
        email: 'user@example.com',
        name: 'User',
        password: 'StrongPassword123!',
        roleIds: ['engineer-role-id'],
      }),
    });

    // Mock Prisma to return NON-ADMIN role
    vi.mocked(prisma.role.findMany).mockResolvedValue([
      { id: 'engineer-role-id', name: 'ENGINEER', description: 'Engineer' } as any,
    ]);

    const res = await POST(req, { session } as any);

    expect(res.status).toBe(201);
    expect(mockCreateUser).toHaveBeenCalled();
  });

  it('should ALLOW ADMIN to assign ADMIN role', async () => {
    // Setup: User is ADMIN
    const session = {
      user: {
        id: 'admin-1',
        roles: ['ADMIN'],
        permissions: [],
      },
    };

    const req = new NextRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({
        email: 'new-admin@example.com',
        name: 'New Admin',
        password: 'StrongPassword123!',
        roleIds: ['admin-role-id'],
      }),
    });

    // Mock Prisma (though not strictly needed if logic skips checks for ADMIN,
    // but our implementation checks role name if roleIds provided)
    // Actually, our implementation:
    // if (!session.user.roles.includes('ADMIN')) { ... check roles ... }
    // So for ADMIN, it skips the DB check for role names.

    // We still mock it just in case logic changes, but we don't expect it to be called
    // unless we change logic.
    vi.mocked(prisma.role.findMany).mockResolvedValue([
        { id: 'admin-role-id', name: 'ADMIN' } as any,
    ]);

    const res = await POST(req, { session } as any);

    expect(res.status).toBe(201);
    expect(mockCreateUser).toHaveBeenCalled();
  });
});
