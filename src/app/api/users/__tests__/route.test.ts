import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

// Mock auth-wrapper
vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: vi.fn((handler) => {
    return async (req: any, context: any) => {
      try {
        const session = {
          user: { id: 'admin-1', roles: ['ADMIN'], permissions: ['USER:READ', 'USER:CREATE'] },
        };
        return await handler(req, { ...context, session });
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

import { GET, POST } from '../route';

describe('API Route: /api/users (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should return user list with pagination info', async () => {
      const mockData = {
        data: [{ id: 'u1', name: 'User 1' }],
        total: 1,
      };
      mockGetAllUsers.mockResolvedValue(mockData);

      const req = new NextRequest('http://localhost/api/users?page=1&pageSize=10');
      const res = await GET(req, { params: Promise.resolve({}) } as any);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toEqual(mockData.data);
      expect(data.meta.totalItems).toBe(1);
    });
  });

  describe('POST', () => {
    it('should create a new user and return it', async () => {
      const mockUser = { id: 'u-new', email: 'new@test.com' };
      mockCreateUser.mockResolvedValue(mockUser);

      const req = new NextRequest('http://localhost/api/users', {
        method: 'POST',
        body: JSON.stringify({
          email: 'new@test.com',
          name: 'New User',
          password: 'StrongPassword123!',
        }),
      });

      const res = await POST(req, { params: Promise.resolve({}) } as any);

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe('u-new');
      expect(mockCreateUser).toHaveBeenCalled();
    });
  });
});
