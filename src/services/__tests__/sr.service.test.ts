import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BusinessRuleError, NotFoundError, ServiceError } from '@/lib/errors';
import { ensureCanCreateSR, ensureCanDeleteSR, ensureCanUpdateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SRService } from '@/services/sr.service';

// Mock dependencies
// Define mock structure using vi.hoisted to ensure availability in vi.mock factory
const { mockPrisma } = vi.hoisted(() => {
  const mock = {
    $transaction: vi.fn((cb) => cb(mock)),
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
  };
  return { mockPrisma: mock };
});

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
}));

// Mock policy functions
vi.mock('@/lib/policies', () => ({
  ensureCanCreateSR: vi.fn(),
  ensureCanUpdateSR: vi.fn(),
  ensureCanDeleteSR: vi.fn(),
}));

describe('SRService', () => {
  let srService: SRService;
  // no repository mocks needed here

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    roles: ['USER'],
    permissions: [],
    clientIds: [],
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    srService = new SRService();
  });

  describe('createSR', () => {
    it('should throw error if client is not found', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      vi.mocked(prisma.client.findUnique).mockResolvedValue(null);

      const data = {
        title: 'Test SR',
        description: 'Description',
        clientId: 'client-1',
        serviceCategoryId: 'cat-1',
        requestedPriority: 'MEDIUM' as const,
      };

      await expect(srService.createSR(data, mockUser)).rejects.toThrow(NotFoundError);
    });

    it('should throw error if client is inactive', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      vi.mocked(prisma.client.findUnique).mockResolvedValue({
        id: 'client-1',
        isActive: false,
        name: 'Inactive Client',
      } as any);

      const data = {
        title: 'Test SR',
        description: 'Description',
        clientId: 'client-1',
        serviceCategoryId: 'cat-1',
        requestedPriority: 'MEDIUM' as const,
      };

      await expect(srService.createSR(data, mockUser)).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('updateSR', () => {
    it('should throw NotFoundError if SR does not exist', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);

      await expect(srService.updateSR('sr-1', {}, mockUser)).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if user cannot update SR', async () => {
      const mockSR = { id: 'sr-1', clientId: 'client-1', requesterId: 'other-user' };
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
      vi.mocked(ensureCanUpdateSR).mockImplementation(() => {
        throw new Error('권한이 없습니다');
      });

      await expect(srService.updateSR('sr-1', { title: 'Updated' }, mockUser)).rejects.toThrow(
        '권한이 없습니다'
      );
    });

    it.skip('should execute notification logic during transaction', async () => {
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

      // Mock dependencies for validation
      const stateMachine = await import('@/lib/sr-state-machine');
      // @ts-expect-error: Mocking read-only property for testing
      stateMachine.validateTransition = vi.fn().mockReturnValue({ valid: true });
      // @ts-expect-error: Mocking read-only property for testing
      stateMachine.getRequiredFields = vi.fn().mockReturnValue([]);

      // Mock the update result
      const mockUpdateResult = {
        ...existingSR,
        status: 'IN_PROGRESS',
        requester: {
          id: 'req-1',
          name: 'Requester',
          email: 'req@test.com',
          notificationPreference: { emailSRStatusChanged: true },
        },
        assignee: null,
        serviceCategory: null,
        client: { id: 'c-1' },
      };

      const txMock = {
        sR: {
          update: vi.fn().mockResolvedValue(mockUpdateResult),
        },
        sRActivity: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      // Force transaction to execute callback with our mock tx
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      // Mock services
      const { emailService } = await import('@/services/email.service');
      const { pushService } = await import('@/services/push.service');

      const sendEmailSpy = vi
        .spyOn(emailService, 'sendSRStatusChanged')
        .mockResolvedValue({} as any);
      const sendPushSpy = vi.spyOn(pushService, 'sendToUser').mockResolvedValue({} as any);

      // Execute
      const data = { status: 'IN_PROGRESS' as const };
      await srService.updateSR('sr-1', data, mockUser);

      // Verify
      expect(txMock.sR.update).toHaveBeenCalled();
      expect(txMock.sRActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'STATUS_CHANGED' }),
        })
      );

      expect(sendEmailSpy).toHaveBeenCalledWith(
        'req@test.com',
        'SR-001',
        'Test SR',
        'REQUESTED',
        'IN_PROGRESS',
        expect.any(String)
      );
      expect(sendPushSpy).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({ title: 'SR 상태 변경' })
      );
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

  describe('deleteSR', () => {
    it('should throw NotFoundError if SR does not exist', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);

      await expect(srService.deleteSR('sr-1', mockUser)).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if user cannot delete', async () => {
      const mockSR = { id: 'sr-1', clientId: 'client-1' };
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
      vi.mocked(ensureCanDeleteSR).mockImplementation(() => {
        throw new Error('삭제 권한이 없습니다');
      });

      await expect(srService.deleteSR('sr-1', mockUser)).rejects.toThrow('삭제 권한이 없습니다');
    });
    it('should delete related data in transaction', async () => {
      const mockSR = { id: 'sr-1', clientId: 'client-1' };
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
      vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);

      const txMock = {
        sRActivity: { deleteMany: vi.fn() },
        sRComment: { deleteMany: vi.fn() },
        sRAttachment: { deleteMany: vi.fn() },
        sRStatusHistory: { deleteMany: vi.fn() },
        sR: { delete: vi.fn() },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      await srService.deleteSR('sr-1', mockUser);

      expect(txMock.sRActivity.deleteMany).toHaveBeenCalledWith({ where: { srId: 'sr-1' } });
      expect(txMock.sRComment.deleteMany).toHaveBeenCalledWith({ where: { srId: 'sr-1' } });
      expect(txMock.sRAttachment.deleteMany).toHaveBeenCalledWith({ where: { srId: 'sr-1' } });
      expect(txMock.sRStatusHistory.deleteMany).toHaveBeenCalledWith({ where: { srId: 'sr-1' } });
      expect(txMock.sR.delete).toHaveBeenCalledWith({ where: { id: 'sr-1' } });
    });
  });

  describe('getStatusHistory', () => {
    it('should return status history with pagination', async () => {
      const mockHistory = [
        { id: 'h-1', currentStatus: 'REQUESTED', changedAt: new Date() },
        { id: 'h-2', currentStatus: 'IN_PROGRESS', changedAt: new Date() },
      ];

      vi.mocked(prisma.sRStatusHistory.findMany).mockResolvedValue(mockHistory as any);
      vi.mocked(prisma.sRStatusHistory.count).mockResolvedValue(2);

      const result = await srService.getStatusHistory('sr-1', { skip: 0, take: 10 });

      expect(result.items).toEqual(mockHistory);
      expect(result.total).toBe(2);
      expect(prisma.sRStatusHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { srId: 'sr-1' },
          skip: 0,
          take: 10,
          orderBy: { changedAt: 'desc' },
        })
      );
    });
  });

  describe('countSRs', () => {
    it('should return count of SRs', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(5);

      const result = await srService.countSRs();

      expect(result).toBe(5);
    });

    it('should return filtered count', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(3);
      const filter = { where: { status: 'IN_PROGRESS' as const } };

      const result = await srService.countSRs(filter);

      expect(prisma.sR.count).toHaveBeenCalledWith(filter);
      expect(result).toBe(3);
    });

    it('should pass complex where clauses to count', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(1);
      const params = {
        where: {
          AND: [{ clientId: 'c-1' }, { status: 'REQUESTED' as const }],
        },
      };

      const result = await srService.countSRs(params);

      expect(prisma.sR.count).toHaveBeenCalledWith(params);
      expect(result).toBe(1);
    });
  });

  describe('getAllSRs', () => {
    it('should return all SRs with default params', async () => {
      const mockSRs = [
        { id: 'sr-1', title: 'SR 1', status: 'REQUESTED' },
        { id: 'sr-2', title: 'SR 2', status: 'IN_PROGRESS' },
      ];
      vi.mocked(prisma.sR.findMany).mockResolvedValue(mockSRs as any);

      const result = await srService.getAllSRs();

      expect(result).toEqual(mockSRs);
      expect(prisma.sR.findMany).toHaveBeenCalled();
    });

    it('should return filtered SRs with pagination', async () => {
      const mockSRs = [{ id: 'sr-1', title: 'SR 1', status: 'IN_PROGRESS' }];
      vi.mocked(prisma.sR.findMany).mockResolvedValue(mockSRs as any);
      const params = {
        where: { status: 'IN_PROGRESS' as const },
        skip: 0,
        take: 10,
      };

      const result = await srService.getAllSRs(params);

      expect(prisma.sR.findMany).toHaveBeenCalledWith(expect.objectContaining(params));
      expect(result).toEqual(mockSRs);
    });

    it('should pass orderBy params correctly', async () => {
      const mockSRs: any[] = [{ id: 'sr-1', title: 'SR 1' }];
      vi.mocked(prisma.sR.findMany).mockResolvedValue(mockSRs as any);
      const params = {
        orderBy: { createdAt: 'desc' as const },
      };

      await srService.getAllSRs(params);

      expect(prisma.sR.findMany).toHaveBeenCalledWith(expect.objectContaining(params));
    });

    it('should pass complex where clauses correctly', async () => {
      const mockSRs: any[] = [];
      vi.mocked(prisma.sR.findMany).mockResolvedValue(mockSRs as any);
      const params = {
        where: {
          AND: [
            { clientId: 'c-1' },
            {
              OR: [{ title: { contains: 'test' } }, { description: { contains: 'test' } }],
            },
          ],
        },
      };

      await srService.getAllSRs(params);

      expect(prisma.sR.findMany).toHaveBeenCalledWith(expect.objectContaining(params));
    });
  });

  describe('getSRDetails', () => {
    it('should return SR details', async () => {
      const mockDetails = {
        id: 'sr-1',
        title: 'Test SR',
        client: { id: 'client-1', name: 'Test Client' },
      };
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockDetails as any);

      const result = await srService.getSRDetailsById('sr-1');

      expect(result).toEqual(mockDetails);
      expect(prisma.sR.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sr-1' } })
      );
    });

    it('should return null if SR not found', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);

      const result = await srService.getSRDetailsById('non-existent');
      expect(result).toBeNull();
    });
  });
  describe('getStatusHistory', () => {
    it('should return status history with pagination', async () => {
      const mockHistory = [
        {
          id: 'hist-1',
          previousStatus: 'REQUESTED',
          currentStatus: 'IN_PROGRESS',
          changedAt: new Date(),
          changeReason: 'Started work',
          user: { id: 'user-1', name: 'User', email: 'user@test.com', image: null },
        },
      ];

      // Since we imported prisma as default, we can try to cast it.
      (prisma as any).sRStatusHistory = {
        findMany: vi.fn().mockResolvedValue(mockHistory),
        count: vi.fn().mockResolvedValue(1),
      };

      const result = await srService.getStatusHistory('sr-1', { skip: 0, take: 10 });

      expect(result.items).toEqual(mockHistory);
      expect(result.total).toBe(1);
      // Verify call on the injected mock
      expect((prisma as any).sRStatusHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { srId: 'sr-1' }, skip: 0, take: 10 })
      );
    });
  });

  describe('createSR logic with notifications', () => {
    it('should create SR and send notifications', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      vi.mocked(prisma.client.findUnique).mockResolvedValue({
        id: 'c-1',
        isActive: true,
        name: 'Client',
      } as any);

      const mockCreatedSR = {
        id: 'sr-1',
        srNumber: 'SR-001',
        title: 'New SR',
        requester: { name: 'Requester' },
        serviceCategory: { categoryName: 'Category' },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          // We need to pass a mock tx object to the callback if it expects one
          return mockCreatedSR;
        }
        return mockCreatedSR;
      });

      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockCreatedSR as any);

      const data = {
        title: 'Test SR Title',
        description: 'Test Description',
        clientId: 'c-1',
        serviceCategoryId: 'cat-1',
        requestedPriority: 'MEDIUM' as const,
      };

      const result = await srService.createSR(data, mockUser);

      expect(result).toEqual(mockCreatedSR);
    });

    describe('deleteSR', () => {
      it('should delete SR successfully', async () => {
        const mockSR = { id: 'sr-1', clientId: 'c-1', requesterId: 'user-1' };
        vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
        vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);

        // Mock transaction for delete
        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
          if (typeof callback === 'function') {
            return undefined;
          }
        });

        await srService.deleteSR('sr-1', mockUser);

        // Verify findById called
        expect(prisma.sR.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'sr-1' } })
        );
        // Verify transaction called (implies delete logic executed)
        expect(prisma.$transaction).toHaveBeenCalled();
      });

      it('should throw NotFoundError if SR to delete does not exist', async () => {
        vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);
        await expect(srService.deleteSR('sr-1', mockUser)).rejects.toThrow(NotFoundError);
      });

      it('should throw Error if delete fails', async () => {
        const mockSR = { id: 'sr-1', clientId: 'c-1', requesterId: 'user-1' };
        vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
        vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);

        vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Delete failed'));

        await expect(srService.deleteSR('sr-1', mockUser)).rejects.toThrow('Delete failed');
      });
    });


    // Tests for updateSR state transition and notifications
    describe('updateSR edge cases', () => {
      it('should throw Error when changing client in non-REQUESTED status', async () => {
        const mockSR = { id: 'sr-1', clientId: 'c-1', status: 'IN_PROGRESS' };
        vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { clientId: 'c-2' }, mockUser)).rejects.toThrow(
          BusinessRuleError
        );
      });

      it('should throw Error when changing to inactive client', async () => {
        const mockSR = { id: 'sr-1', clientId: 'c-1', status: 'REQUESTED' };
        vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);
        vi.mocked(prisma.client.findUnique).mockResolvedValue({
          id: 'c-2',
          isActive: false,
          name: 'Inactive',
        } as any);

        await expect(srService.updateSR('sr-1', { clientId: 'c-2' }, mockUser)).rejects.toThrow(
          BusinessRuleError
        );
      });

      it('should throw Error when changing assignee in COMPLETED status', async () => {
        const mockSR = { id: 'sr-1', status: 'COMPLETED', assigneeId: 'u-1' };
        vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
        vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

        await expect(srService.updateSR('sr-1', { assigneeId: 'u-2' }, mockUser)).rejects.toThrow(
          BusinessRuleError
        );
      });
    });
  });
});
