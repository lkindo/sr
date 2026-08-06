import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '@/lib/errors';
import { ensureCanCreateSR, ensureCanDeleteSR, ensureCanUpdateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SRService } from '@/services/sr.service';

// Mock dependencies with inline definition to avoid hoisting issues
vi.mock('@/lib/prisma', () => {
  const mock = {
    $transaction: vi.fn((cb) => cb(mock)),
    $queryRaw: vi.fn().mockResolvedValue([{ seq: 1 }]),
    sR: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    sRActivity: { create: vi.fn(), deleteMany: vi.fn().mockResolvedValue({}) },
    sRSequence: { upsert: vi.fn().mockResolvedValue({ date: '20230101', seq: 1 }) },
    client: { findUnique: vi.fn().mockResolvedValue(null) },
    user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
    serviceCategory: { findUnique: vi.fn().mockResolvedValue(null) },
    sRComment: { deleteMany: vi.fn().mockResolvedValue({}) },
    sRAttachment: { deleteMany: vi.fn().mockResolvedValue({}) },
    sRStatusHistory: {
      deleteMany: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  return { default: mock };
});

vi.mock('@/lib/domain-events', () => ({
  domainEvents: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}));

// ensure* 만 스텁으로 대체하고 isInternalUser 는 실제 구현을 사용한다.
// (테넌트 판정을 mock 으로 우회하면 경계 검증이 무력화된다.)
vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return {
    ...actual,
    ensureCanCreateSR: vi.fn(),
    ensureCanUpdateSR: vi.fn(),
    ensureCanDeleteSR: vi.fn(),
  };
});

vi.mock('@/services/push.service', () => ({
  pushService: {
    sendToUsers: vi.fn().mockResolvedValue({}),
    sendToUser: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/services/email.service', () => ({
  emailService: {
    sendSRStatusChanged: vi.fn().mockResolvedValue({}),
    sendSROpened: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/sr-state-machine', () => ({
  validateTransition: vi.fn().mockReturnValue({ valid: true }),
  getRequiredFields: vi.fn().mockReturnValue([]),
}));

describe('SRService Mutation Tests', () => {
  let srService: SRService;
  // 외부(고객사) 사용자이며 이 스위트가 사용하는 고객사 'c-1' 에 소속되어 있다.
  // → 테넌트 가드를 통과하므로 각 테스트가 의도한 후속 분기까지 도달한다.
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test',
    roles: ['USER'],
    permissions: [],
    clientIds: ['c-1'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    srService = new SRService();
  });

  it('instantiates correctly', () => {
    expect(srService).toBeDefined();
  });

  describe('createSR', () => {
    it('should call prisma.create with correct data', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      // Use mocked prisma instance
      vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c-1', isActive: true } as any);
      vi.mocked(prisma.sR.create).mockResolvedValue({ id: 'sr-1', srNumber: 'SR-001' } as any);
      vi.mocked(prisma.sR.findUnique).mockResolvedValue({
        id: 'sr-1',
        srNumber: 'SR-001',
        title: 'Mutant Test',
        client: { id: 'c-1', name: 'Client' },
      } as any);

      const data = {
        title: 'Mutant Test',
        description: 'Description must be long enough',
        clientId: 'c-1',
        serviceCategoryId: 'cat-1',
        requestedPriority: 'MEDIUM' as const,
      };

      await srService.createSR(data, mockUser as any);

      expect(prisma.sR.create).toHaveBeenCalled();
    });

    it('should throw if client is inactive', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      vi.mocked(prisma.client.findUnique).mockResolvedValue({
        id: 'c-1',
        isActive: false,
        name: 'Inactive',
      } as any);

      const data = {
        title: 'Test Title',
        description: 'Long enough desc',
        clientId: 'c-1',
        serviceCategoryId: 'cat-1',
        requestedPriority: 'MEDIUM' as const,
      };

      await expect(srService.createSR(data, mockUser as any)).rejects.toThrow('비활성 상태');
    });
  });

  describe('updateSR', () => {
    it('should update SR and send notifications', async () => {
      const existingSR = {
        id: 'sr-1',
        status: 'REQUESTED',
        clientId: 'c-1',
        requesterId: 'req-1',
        srNumber: 'SR-001',
        title: 'Test SR',
        serviceCategoryId: 'cat-1',
        actualPriority: 'MEDIUM',
      };
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(existingSR as any);
      vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

      // Mock transaction result
      const mockUpdateResult = {
        ...existingSR,
        status: 'IN_PROGRESS',
        requester: {
          id: 'req-1',
          name: 'Requester',
          email: 'req@test.com',
          notificationPreference: { emailSRStatusChanged: true },
        },
        client: { id: 'c-1' },
      };

      vi.mocked(prisma.sR.update).mockResolvedValue(mockUpdateResult as any);

      // Mock transaction execution
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        // Manually invoke the callback with the mocked prisma instance
        // to simulate transaction scope matching the test scope
        return callback(prisma);
      });

      const data = { status: 'IN_PROGRESS' as const };
      await srService.updateSR('sr-1', data, mockUser as any);

      expect(prisma.sR.update).toHaveBeenCalled();
      // Optimization: sRActivity.create should NOT be called directly, but via nested write
      expect(prisma.sRActivity.create).not.toHaveBeenCalled();

      const updateCall = vi.mocked(prisma.sR.update).mock.calls[0];
      const updateData = updateCall?.[0]?.data;
      expect(updateData?.activities?.create).toBeDefined();

      // Verify notifications
      const { domainEvents } = await import('@/lib/domain-events');
      expect(domainEvents.emit).toHaveBeenCalledWith('sr:status_changed', expect.any(Object));
    });

    it('should throw NotFoundError if SR does not exist', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);
      await expect(srService.updateSR('sr-1', {}, mockUser as any)).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteSR', () => {
    it('should delete SR successfully', async () => {
      const mockSR = { id: 'sr-1', clientId: 'c-1', requesterId: 'user-1' };
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
      vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);

      // Mock transaction execution
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      await srService.deleteSR('sr-1', mockUser as any);

      expect(prisma.sR.delete).toHaveBeenCalledWith({ where: { id: 'sr-1' } });
    });

    it('should throw NotFoundError if SR does not exist', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);
      await expect(srService.deleteSR('sr-1', mockUser as any)).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if user cannot delete', async () => {
      const mockSR = { id: 'sr-1', clientId: 'c-1' };
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
      vi.mocked(ensureCanDeleteSR).mockImplementation(() => {
        throw new Error('전용 예외');
      });

      await expect(srService.deleteSR('sr-1', mockUser as any)).rejects.toThrow('전용 예외');
    });
  });

  describe('getSRById', () => {
    it('should return SR by id', async () => {
      const mockSR = { id: 'sr-1', title: 'Test SR' };
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);

      const result = await srService.getSRById('sr-1');

      expect(result).toEqual(mockSR);
      expect(prisma.sR.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sr-1' } })
      );
    });

    it('should return null if SR not found', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);
      const result = await srService.getSRById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getAllSRs', () => {
    it('should return list of SRs', async () => {
      const mockSRs = [
        { id: 'sr-1', title: 'SR 1' },
        { id: 'sr-2', title: 'SR 2' },
      ];
      vi.mocked(prisma.sR.findMany).mockResolvedValue(mockSRs as any);
      const result = await srService.getAllSRs({ skip: 0, take: 10 });
      expect(result).toEqual(mockSRs);
      expect(prisma.sR.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 })
      );
    });
  });

  describe('countSRs', () => {
    it('should return count of SRs', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(5);
      const result = await srService.countSRs();
      expect(result).toBe(5);
      expect(prisma.sR.count).toHaveBeenCalled();
    });
    describe('getSRDetailsById', () => {
      it('should return SR details', async () => {
        const mockSR = { id: 'sr-1', title: 'Details' };
        vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
        const result = await srService.getSRDetailsById('sr-1');
        expect(result).toEqual(mockSR);
      });
    });
  });
});
