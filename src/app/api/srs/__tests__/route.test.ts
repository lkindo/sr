import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
        // Use provided session or default to basic user
        const session = context?.session || {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            roles: [],
            permissions: [],
            clientIds: ['client-1'],
          },
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
        const session = context?.session || {
          user: {
            id: 'user-1',
            roles: [],
            permissions: [],
            clientIds: [],
          },
        };
        return await handler(req, { ...context, session });
      } catch (error) {
        return mockHandleApiError(error);
      }
    };
  }),
}));

// Mock services
vi.mock('@/services/sr.service', () => ({
  SRService: vi.fn(),
  srService: {
    getAllSRs: mockGetAllSRs,
    createSR: mockCreateSR,
  },
}));

vi.mock('@/services/permission.service', () => ({
  PermissionService: class {
    checkPermission = mockCheckPermission;
  },
}));

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    sR: { count: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

// Mock serialization
vi.mock('@/lib/serialization', () => ({
  serializeResponse: vi.fn((data) => data),
}));

import prisma from '@/lib/prisma';

import { GET, POST } from '../route';

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

      const session = {
        user: {
          id: 'user-1',
          roles: [],
          permissions: ['SR:CREATE'],
          clientIds: ['client-1'],
        },
      };

      const res = await POST(req, { params: Promise.resolve({}), session } as any);

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

      const session = {
        user: {
          id: 'user-1',
          roles: [],
          permissions: [], // No permissions
          clientIds: ['client-1'],
        },
      };

      const res = await POST(req, { params: Promise.resolve({}), session } as any);

      expect(res.status).toBe(403);
      expect(mockHandleApiError).toHaveBeenCalled();
    });
  });
});
