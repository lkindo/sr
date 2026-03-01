import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../route';

// Mock dependencies
const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock('@/services/user.service', () => ({
  UserService: class {
    createUser = mocks.createUser;
  },
}));

// Mock auth wrapper to simulate authenticated admin
vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => async (req: any, context: any) => {
    const session = {
      user: {
        id: 'admin-1',
        roles: ['ADMIN'],
        permissions: ['USER:CREATE', 'USER:READ']
      },
    };
    try {
      return await handler(req, { ...context, session });
    } catch (error) {
      // In the real app, handleApiError catches this.
      // Here we can rethrow or handle it similarly if we want to test the response.
      // But since we want to verify validation happens before service call, checking service call is enough.
      return mocks.handleApiError(error);
    }
  },
}));

vi.mock('@/lib/policies', () => ({
  ensureCanCreateUser: vi.fn(),
  ensureCanReadUser: vi.fn(),
}));

describe('API Route: /api/users (Validation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject weak passwords', async () => {
    // Attempt to create user with weak password
    const body = {
      email: 'weak@test.com',
      name: 'Weak User',
      password: '123', // Too short, no special chars, etc.
    };

    const req = new NextRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    await POST(req, {} as any);

    // FIX VERIFICATION:
    // The service should NOT be called because validation failed.
    expect(mocks.createUser).not.toHaveBeenCalled();

    // Check that handleApiError was called (indicating an error occurred)
    expect(mocks.handleApiError).toHaveBeenCalled();
  });
});
