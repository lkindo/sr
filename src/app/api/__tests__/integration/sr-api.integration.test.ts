/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { auth } from '@/auth';

import { POST } from '../../srs/route';

// Mock dependencies
// Mock dependencies
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    sr: { create: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

const mockCheckPermission = vi.fn().mockResolvedValue(true);
vi.mock('@/services/permission.service', () => ({
  PermissionService: vi.fn().mockImplementation(function (this: any) {
    return {
      checkPermission: mockCheckPermission,
    };
  }),
}));

const mockCreateSR = vi.fn();
const mockGetAllSRs = vi.fn();

vi.mock('@/services/sr.service', () => ({
  SRService: vi.fn().mockImplementation(function (this: any) {
    return {
      createSR: mockCreateSR,
      getAllSRs: mockGetAllSRs,
    };
  }),
  srService: {
    createSR: (...args: any[]) => mockCreateSR(...args),
    getAllSRs: (...args: any[]) => mockGetAllSRs(...args),
  },
}));

import { ServiceError } from '@/lib/errors';

describe('SR API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Create SR - Unauthenticated returns 401', async () => {
    (auth as any).mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/srs', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it('Create SR - Valid request calls service', async () => {
    // Mock session
    (auth as any).mockResolvedValue({
      user: {
        id: 'user-1',
        roles: ['CLIENT_USER'],
        permissions: ['SR:CREATE'],
        clientIds: ['client-1'],
      },
    });

    // Mock Service Response
    mockCreateSR.mockResolvedValue({
      id: 'sr-123',
      srNumber: 'SR-2023-0001',
    });

    const payload = {
      title: 'Integration Test SR',
      description: 'Testing API Route',
      clientId: 'client-1',
      serviceCategoryId: 'cat-1',
      requestedPriority: 'MEDIUM',
    };

    const req = new NextRequest('http://localhost/api/srs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.srNumber).toBe('SR-2023-0001');
    expect(mockCreateSR).toHaveBeenCalled();
  });

  it('Create SR - Validation Error returns 400', async () => {
    (auth as any).mockResolvedValue({
      user: {
        id: 'user-1',
        roles: ['CLIENT_USER'],
        permissions: ['SR:CREATE'],
        clientIds: ['client-1'],
      },
    });

    // Missing title
    const payload = {
      description: 'No Title',
    };

    mockCreateSR.mockRejectedValue(new ServiceError('Validation Error', 'VALIDATION_ERROR', 400));

    const req = new NextRequest('http://localhost/api/srs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });
});
