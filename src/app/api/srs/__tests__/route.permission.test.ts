
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PERMISSIONS } from '@/lib/permission-helpers';

// --- Mocks ---

const mocks = vi.hoisted(() => ({
  getAllSRs: vi.fn().mockResolvedValue([]),
  checkPermission: vi.fn(),
  isInternalUser: vi.fn(),
}));

vi.mock('@/services/sr.service', () => ({
  srService: {
    getAllSRs: mocks.getAllSRs,
  },
}));

vi.mock('@/services/permission.service', () => ({
  PermissionService: class {
    checkPermission = mocks.checkPermission;
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    sR: { count: vi.fn().mockResolvedValue(0) },
  },
}));

// Mock policies to control isInternalUser
vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return {
    ...actual,
    isInternalUser: mocks.isInternalUser,
  };
});

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => handler,
}));

vi.mock('@/lib/serialization', () => ({
  serializeResponse: (data: any) => data,
}));

vi.mock('@/lib/pagination', () => ({
  usePagination: () => ({
    skip: 0,
    take: 10,
    orderBy: {},
    createResponse: (data: any) => ({ data, meta: {} }),
  }),
}));

import { GET } from '../route';

describe('API Route Permission: /api/srs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should deny access if user does not have SR:READ permission', async () => {
    // Setup: User has NO permission in session
    // mocks.isInternalUser.mockReturnValue(true); // Internal user but stripped permissions

    const mockSession = {
      user: {
        id: 'user-no-perm',
        roles: ['SOME_ROLE'],
        clientIds: [],
        permissions: [], // Empty permissions
      },
    };

    // Act
    const req = new NextRequest('http://localhost/api/srs');

    // We expect ForbiddenError
    try {
      await (GET as any)(req, { session: mockSession });
      // If it doesn't throw, fail the test
      throw new Error('Should have thrown ForbiddenError');
    } catch (error: any) {
       expect(error.message).toContain('SR 조회 권한이 없습니다');
       expect(mocks.getAllSRs).not.toHaveBeenCalled();
    }
  });

  it('should allow access if user has SR:READ permission', async () => {
    // Setup: User HAS permission
    mocks.isInternalUser.mockReturnValue(true);

    const mockSession = {
      user: {
        id: 'user-with-perm',
        roles: ['ADMIN'],
        clientIds: [],
        permissions: [PERMISSIONS.SR.READ], // Has SR:READ
      },
    };

    // Act
    const req = new NextRequest('http://localhost/api/srs');
    await (GET as any)(req, { session: mockSession });

    // Assert
    expect(mocks.getAllSRs).toHaveBeenCalled();
  });
});
