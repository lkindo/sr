import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as actions from '@/actions/sr.actions';
import { SRService } from '@/services/sr.service';

// Mock dependencies
vi.mock('@/services/sr.service');
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/action-helpers', () => ({
  authenticateAndAuthorize: vi.fn(),
  validateWithSchema: vi.fn(),
  getAuthenticatedSession: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    sRActivity: { findMany: vi.fn() },
    sRComment: { findMany: vi.fn() },
  },
}));

describe('SR Actions - Details and Pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSRDetailsAction', () => {
    it('returns success when SR is found', async () => {
      const mockSR = { id: 'sr-1', title: 'Test SR' };
      vi.mocked(SRService.prototype.getSRDetailsById).mockResolvedValue(mockSR as any);

      const result = await actions.getSRDetailsAction('sr-1');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockSR);
      }
    });

    it('returns fail when SR is not found', async () => {
      vi.mocked(SRService.prototype.getSRDetailsById).mockResolvedValue(null);

      const result = await actions.getSRDetailsAction('non-existent');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('getSRActivitiesAction', () => {
    it('handles pagination correctly', async () => {
      const { default: prisma } = await import('@/lib/prisma');
      const mockActivities = [
        {
          id: 'act-1',
          type: 'STATUS_CHANGED',
          description: 'desc1',
          createdAt: new Date(),
          user: { id: 'u1', name: 'N', image: null },
        },
        {
          id: 'act-2',
          type: 'COMMENT_ADDED',
          description: 'desc2',
          createdAt: new Date(),
          user: { id: 'u1', name: 'N', image: null },
        },
      ];
      vi.mocked(prisma.sRActivity.findMany).mockResolvedValue(mockActivities as any);

      const result = await actions.getSRActivitiesAction('sr-1', { limit: 1 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activities).toHaveLength(1);
        expect(result.data.nextCursor).toBe('act-1');
      }
    });
  });

  describe('getSRCommentsAction', () => {
    it('handles pagination correctly', async () => {
      const { default: prisma } = await import('@/lib/prisma');
      const mockComments = [
        {
          id: 'c1',
          content: 'C1',
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: 'u1', name: 'N', image: null },
        },
        {
          id: 'c2',
          content: 'C2',
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: 'u1', name: 'N', image: null },
        },
      ];
      vi.mocked(prisma.sRComment.findMany).mockResolvedValue(mockComments as any);

      const result = await actions.getSRCommentsAction('sr-1', { limit: 1 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.comments).toHaveLength(1);
        expect(result.data.nextCursor).toBe('c1');
      }
    });
  });
});
