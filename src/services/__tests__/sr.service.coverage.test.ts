import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureCanCreateSR, ensureCanUpdateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SRService } from '@/services/sr.service';

// Mock dependencies
vi.mock('@/lib/policies', () => ({
  ensureCanCreateSR: vi.fn(),
  ensureCanUpdateSR: vi.fn(),
  ensureCanDeleteSR: vi.fn(),
}));

vi.mock('@/lib/wait-until', () => ({
  backgroundTask: vi.fn(async (promise) => {
    try {
      await promise;
    } catch (e) {
      /* ignore */
    }
  }),
  backgroundTasks: vi.fn(async (tasks: any[]) => Promise.all(tasks.map((t: any) => t.promise))),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn((callback) => callback(prisma)),
    sR: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    sRActivity: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    sRSequence: {
      upsert: vi.fn().mockResolvedValue({ date: '20231010', seq: 1 }),
    },
    sRComment: {
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    sRAttachment: {
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    sRStatusHistory: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    client: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    serviceCategory: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/lib/sr-state-machine', () => ({
  validateTransition: vi.fn(),
  getRequiredFields: vi.fn(),
}));

describe('SRService - Expanded Coverage', () => {
  let srService: SRService;

  const mockUser = {
    id: 'user-1',
    roles: ['ADMIN'],
    permissions: [],
    clientIds: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-10-10T10:00:00Z'));

    srService = new SRService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('updateSR - Validation Branches', () => {
    it('should throw error when missing required fields for status change', async () => {
      const existingSR = { id: 'sr-1', status: 'REQUESTED' };
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(existingSR as any);
      vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

      const { validateTransition, getRequiredFields } = await import('@/lib/sr-state-machine');
      vi.mocked(validateTransition).mockReturnValue({ valid: true });
      vi.mocked(getRequiredFields).mockReturnValue(['assigneeId']);

      await expect(
        srService.updateSR('sr-1', { status: 'IN_PROGRESS' }, mockUser as any)
      ).rejects.toThrow('담당자(assigneeId)');
    });
  });

  describe('createSR - Sequence Logic', () => {
    it('should handle sequential SR numbering correctly using SRSequence', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c-1', isActive: true } as any);

      const txMock = {
        sR: {
          create: vi.fn().mockResolvedValue({ id: 'sr-1', srNumber: 'SR-20231010-0006' }),
        },
        sRSequence: {
          upsert: vi.fn().mockResolvedValue({ date: '20231010', seq: 6 }),
        },
        sRActivity: { create: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
        callback(txMock as any)
      );

      vi.mocked(prisma.sR.findUnique).mockResolvedValue({
        id: 'sr-1',
        srNumber: 'SR-20231010-0006',
        title: 'T',
        requester: { name: 'R', notificationPreference: {} },
        serviceCategory: { categoryName: 'C' },
      } as any);

      await srService.createSR(
        {
          title: 'Title Valid',
          description: 'Description Valid Long',
          clientId: 'c-1',
          serviceCategoryId: 'cat-1',
          requestedPriority: 'MEDIUM',
        },
        mockUser as any
      );

      // Verify sequence upsert was called
      expect(txMock.sRSequence.upsert).toHaveBeenCalled();

      // Verify SR creation used the sequence number
      expect(txMock.sR.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ srNumber: 'SR-20231010-0006' }),
        })
      );
    });
  });
});
