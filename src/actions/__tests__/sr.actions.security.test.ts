import { beforeEach, describe, expect, it, vi } from 'vitest';

import { auth } from '@/auth';

import {
  getSRActivitiesAction,
  getSRCommentsAction,
  getSRDetailsAction,
  getSRRequesterCandidatesAction,
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
      getSRActivities: vi.fn(),
      getSRComments: vi.fn(),
      getRequesterCandidates: vi.fn(),
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
      mockSRService.getSRActivities.mockResolvedValue({
        activities: mockActivities,
        nextCursor: null,
      });

      const result = await getSRActivitiesAction('sr-1');

      expect(result.success).toBe(false);
    });

    it('allows authorized access', async () => {
      vi.mocked(auth).mockResolvedValue({ user: authorizedUser, expires: '2099-01-01' } as any);
      mockSRService.getSRById.mockResolvedValue(targetSR);
      const mockActivities = [{ id: 'act-1', description: 'Secret Activity' }];
      mockSRService.getSRActivities.mockResolvedValue({
        activities: mockActivities,
        nextCursor: null,
      });

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
      mockSRService.getSRComments.mockResolvedValue({ comments: mockComments, nextCursor: null });

      const result = await getSRCommentsAction('sr-1');

      expect(result.success).toBe(false);
    });

    it('allows authorized access', async () => {
      vi.mocked(auth).mockResolvedValue({ user: authorizedUser, expires: '2099-01-01' } as any);
      mockSRService.getSRById.mockResolvedValue(targetSR);
      const mockComments = [{ id: 'cmt-1', content: 'Secret Comment' }];
      mockSRService.getSRComments.mockResolvedValue({ comments: mockComments, nextCursor: null });

      const result = await getSRCommentsAction('sr-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.comments).toHaveLength(1);
      }
    });

    // 내부 댓글 필터는 서비스가 viewer 의 역할로 판정한다. 그 판정이 옳아도 액션이
    // 세션 사용자가 아닌 다른 값을 넘기면 소용없다 — tsc 는 AuthenticatedUser 타입이
    // 넘어오는 것까지만 보장하므로, 배선 자체를 여기서 고정한다.
    it('세션 사용자를 viewer 로 서비스에 넘긴다', async () => {
      vi.mocked(auth).mockResolvedValue({ user: authorizedUser, expires: '2099-01-01' } as never);
      mockSRService.getSRById.mockResolvedValue(targetSR);
      mockSRService.getSRComments.mockResolvedValue({ comments: [], nextCursor: null });

      await getSRCommentsAction('sr-1', { limit: 5 });

      expect(mockSRService.getSRComments).toHaveBeenCalledWith(
        'sr-1',
        expect.objectContaining({ id: authorizedUser.id, roles: authorizedUser.roles }),
        { limit: 5 }
      );
    });
  });
});

/**
 * 대리 등록 후보(D3). 고객사 사용자의 이름·이메일 목록이므로 대리 등록을 할 수 있는 내부 사용자만 받는다.
 */
describe('getSRRequesterCandidatesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSRService.getRequesterCandidates.mockResolvedValue([{ id: 'c', name: 'n', email: 'e' }]);
  });

  it('외부 사용자는 거부하고 목록을 조회하지 않는다', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: 'ca',
        roles: ['CLIENT_ADMIN'],
        permissions: ['SR:CREATE'],
        clientIds: ['client-1'],
      },
      expires: '2099-01-01',
    } as never);

    const result = await getSRRequesterCandidatesAction('client-1');

    expect(result.success).toBe(false);
    expect(mockSRService.getRequesterCandidates).not.toHaveBeenCalled();
  });

  it('내부 사용자에게는 그 고객사의 후보를 준다', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'mgr', roles: ['MANAGER'], permissions: ['SR:CREATE'], clientIds: [] },
      expires: '2099-01-01',
    } as never);

    const result = await getSRRequesterCandidatesAction('client-1');

    expect(result).toEqual({ success: true, data: [{ id: 'c', name: 'n', email: 'e' }] });
    expect(mockSRService.getRequesterCandidates).toHaveBeenCalledWith('client-1');
  });
});
