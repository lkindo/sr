import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const { mockChangePassword, mockHandleApiError } = vi.hoisted(() => ({
  mockChangePassword: vi.fn(),
  mockHandleApiError: vi.fn((error) => {
    const status = error.statusCode || 500;
    return NextResponse.json({ error: error.message || 'Error' }, { status });
  }),
}));

vi.mock('@/services/user.service', () => ({
  UserService: class {
    changePassword = mockChangePassword;
  },
}));

// Mock api-error-handler to catch errors thrown in the route
vi.mock('@/lib/api-error-handler', () => ({
  handleApiError: mockHandleApiError,
}));

// Mock auth wrapper to inject session and handle errors
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

import { POST } from '../route';

describe('API Route: /api/profile/password (Password Policy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should REJECT weak password (6 chars, no complexity)', async () => {
    const req = new NextRequest('http://localhost/api/profile/password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: 'old-password',
        newPassword: 'weak12', // 6 chars, no complexity
        confirmPassword: 'weak12',
      }),
    });

    const context = {
      session: {
        user: { id: 'user-1', email: 'test@example.com' },
      },
    };

    const res = await POST(req, context as any);

    // Expect 400 Bad Request due to validation error
    // If it was 500, it would be "Error". If it was ValidationError, it maps to 400.
    // However, I need to check how ValidationError is handled.
    // The route throws ValidationError, which has statusCode 400 usually.
    // In `src/lib/errors.ts`, ValidationError extends AppError with statusCode 400.

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(mockChangePassword).not.toHaveBeenCalled();
    // The error message comes from Zod via ValidationError
    // "비밀번호는 최소 8자 이상이어야 합니다." or similar
  });

  it('should ACCEPT strong password', async () => {
    mockChangePassword.mockResolvedValue({ id: 'user-1' });

    const strongPassword = 'StrongPassword1!';
    const req = new NextRequest('http://localhost/api/profile/password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: 'old-password',
        newPassword: strongPassword,
        confirmPassword: strongPassword,
      }),
    });

    const context = {
      session: {
        user: { id: 'user-1', email: 'test@example.com' },
      },
    };

    const res = await POST(req, context as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockChangePassword).toHaveBeenCalledWith(
      'user-1',
      'old-password',
      strongPassword,
      'user-1'
    );
  });
});
