import { beforeEach, describe, expect, it, vi } from 'vitest';

import { auth } from '@/auth';

import {
  getSRAction,
  getSRActivitiesAction,
  getSRCommentsAction,
  getSRDetailsAction,
} from '../sr.actions';

// Mock dependencies
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// Mock SRService
const { mockSRService } = vi.hoisted(() => {
  return {
    mockSRService: {
      getSRById: vi.fn(),
      getSRDetailsById: vi.fn(),
    },
  };
});

vi.mock('@/services/sr.service', () => ({
  srService: mockSRService,
}));

// Mock Prisma
const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      sRActivity: { findMany: vi.fn() },
      sRComment: { findMany: vi.fn() },
    },
  };
});

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
}));

describe('SR Server Actions Security', () => {
  const unauthorizedUser = {
    id: 'user-2',
    name: 'Bad User',
    roles: ['USER'],
    permissions: [],
    clientIds: ['client-2'], // Different client
  };

  const authorizedUser = {
    id: 'user-1',
    name: 'Good User',
    roles: ['USER'],
    permissions: ['SR:UPDATE_SELF'], // Needed for isRequester check
    clientIds: ['client-1'], // Same client
  };

  const targetSR = {
    id: 'sr-1',
    clientId: 'client-1',
    requesterId: 'user-1',
    title: 'Secret SR',
    status: 'REQUESTED',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSRAction Security', () => {
    it('blocks unauthorized access', async () => {
      vi.mocked(auth).mockResolvedValue({ user: unauthorizedUser, expires: '2099-01-01' } as any);
      mockSRService.getSRById.mockResolvedValue(targetSR);

      const result = await getSRAction('sr-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        // It might be FORBIDDEN or whatever errorToResult converts ForbiddenError to.
        // ForbiddenError usually maps to 403 or similar code if handled, or just 'ERROR'
        // Let's just check it failed.
        // Based on other tests, it might return { success: false, error: ... }
      }
    });

    it('allows authorized access', async () => {
      vi.mocked(auth).mockResolvedValue({ user: authorizedUser, expires: '2099-01-01' } as any);
      mockSRService.getSRById.mockResolvedValue(targetSR);

      const result = await getSRAction('sr-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(targetSR);
      }
    });
  });

  describe('getSRDetailsAction Security', () => {
    it('blocks unauthorized access', async () => {
      vi.mocked(auth).mockResolvedValue({ user: unauthorizedUser, expires: '2099-01-01' } as any);
      mockSRService.getSRDetailsById.mockResolvedValue(targetSR);

      const result = await getSRDetailsAction('sr-1');

      expect(result.success).toBe(false);
    });

    it('allows authorized access', async () => {
      vi.mocked(auth).mockResolvedValue({ user: authorizedUser, expires: '2099-01-01' } as any);
      mockSRService.getSRDetailsById.mockResolvedValue(targetSR);

      const result = await getSRDetailsAction('sr-1');

      expect(result.success).toBe(true);
    });
  });

  describe('getSRActivitiesAction Security', () => {
    it('blocks unauthorized access', async () => {
      vi.mocked(auth).mockResolvedValue({ user: unauthorizedUser, expires: '2099-01-01' } as any);
      mockSRService.getSRById.mockResolvedValue(targetSR); // SR exists
      const mockActivities = [{ id: 'act-1', description: 'Secret Activity' }];
      mockPrisma.sRActivity.findMany.mockResolvedValue(mockActivities);

      const result = await getSRActivitiesAction('sr-1');

      expect(result.success).toBe(false);
    });

    it('allows authorized access', async () => {
      vi.mocked(auth).mockResolvedValue({ user: authorizedUser, expires: '2099-01-01' } as any);
      mockSRService.getSRById.mockResolvedValue(targetSR);
      const mockActivities = [{ id: 'act-1', description: 'Secret Activity' }];
      mockPrisma.sRActivity.findMany.mockResolvedValue(mockActivities);

      const result = await getSRActivitiesAction('sr-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activities).toHaveLength(1);
      }
    });
  });

  describe('getSRCommentsAction Security', () => {
    it('blocks unauthorized access', async () => {
      vi.mocked(auth).mockResolvedValue({ user: unauthorizedUser, expires: '2099-01-01' } as any);
      mockSRService.getSRById.mockResolvedValue(targetSR);
      const mockComments = [{ id: 'cmt-1', content: 'Secret Comment' }];
      mockPrisma.sRComment.findMany.mockResolvedValue(mockComments);

      const result = await getSRCommentsAction('sr-1');

      expect(result.success).toBe(false);
    });

    it('allows authorized access', async () => {
      vi.mocked(auth).mockResolvedValue({ user: authorizedUser, expires: '2099-01-01' } as any);
      mockSRService.getSRById.mockResolvedValue(targetSR);
      const mockComments = [{ id: 'cmt-1', content: 'Secret Comment' }];
      mockPrisma.sRComment.findMany.mockResolvedValue(mockComments);

      const result = await getSRCommentsAction('sr-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.comments).toHaveLength(1);
      }
    });
  });
});
