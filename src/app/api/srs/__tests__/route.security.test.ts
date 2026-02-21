/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PERMISSIONS } from '@/lib/permission-helpers';

// --- Mocks ---

const mocks = vi.hoisted(() => ({
  getAllSRs: vi.fn(),
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

vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return {
    ...actual,
    isInternalUser: mocks.isInternalUser,
  };
});

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => handler, // Return the handler directly
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

// Import the route handler (triggers the mock)
import { GET } from '../route';

describe('API Route Security: /api/srs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should restrict external users to their own clientIds when no filter provided', async () => {
    // Setup
    const mockSession = {
      user: {
        id: 'user-external',
        roles: ['USER'],
        clientIds: ['client-A'],
        permissions: [PERMISSIONS.SR.READ],
      },
    };
    mocks.isInternalUser.mockReturnValue(false);

    // Act
    const req = new NextRequest('http://localhost/api/srs');
    await (GET as any)(req, { session: mockSession });

    // Assert
    expect(mocks.getAllSRs).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: ['client-A'] },
        }),
      })
    );
  });

  it('should allow internal users to see all SRs (no forced filter)', async () => {
    // Setup
    const mockSession = {
      user: {
        id: 'user-admin',
        roles: ['ADMIN'],
        clientIds: [],
        permissions: [PERMISSIONS.SR.READ],
      },
    };
    mocks.isInternalUser.mockReturnValue(true);

    // Act
    const req = new NextRequest('http://localhost/api/srs');
    await (GET as any)(req, { session: mockSession });

    // Assert: clientId filter should be undefined (no restriction)
    const callArgs = mocks.getAllSRs.mock.calls[0][0];
    const where = callArgs.where || {};
    expect(where.clientId).toBeUndefined();
  });

  it('should allow internal users to filter by specific client', async () => {
    // Setup
    const mockSession = {
      user: {
        id: 'user-admin',
        roles: ['ADMIN'],
        clientIds: [],
        permissions: [PERMISSIONS.SR.READ],
      },
    };
    mocks.isInternalUser.mockReturnValue(true);

    // Act
    const req = new NextRequest('http://localhost/api/srs?clientId=client-B');
    await (GET as any)(req, { session: mockSession });

    // Assert
    expect(mocks.getAllSRs).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 'client-B',
        }),
      })
    );
  });

  it('should return empty list when external user requests unauthorized client', async () => {
    // Setup
    const mockSession = {
      user: {
        id: 'user-external',
        roles: ['USER'],
        clientIds: ['client-A'],
        permissions: [PERMISSIONS.SR.READ],
      },
    };
    mocks.isInternalUser.mockReturnValue(false);

    // Act
    const req = new NextRequest('http://localhost/api/srs?clientId=client-B');
    const res = await (GET as any)(req, { session: mockSession });

    // Assert
    // Should NOT call getAllSRs (optimization: return early)
    expect(mocks.getAllSRs).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('should return empty list when external user has NO assigned clients', async () => {
    // Setup
    const mockSession = {
      user: {
        id: 'user-external',
        roles: ['USER'],
        clientIds: [], // No clients
        permissions: [PERMISSIONS.SR.READ],
      },
    };
    mocks.isInternalUser.mockReturnValue(false);

    // Act
    const req = new NextRequest('http://localhost/api/srs');
    const res = await (GET as any)(req, { session: mockSession });

    // Assert
    expect(mocks.getAllSRs).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
