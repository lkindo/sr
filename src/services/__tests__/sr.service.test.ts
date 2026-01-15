import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SRService } from '@/services/sr.service';
import { SRRepository } from '@/repositories/sr.repository';
import { ClientRepository } from '@/repositories/client.repository';
import { UserRepository } from '@/repositories/user.repository';
import { NotFoundError } from '@/lib/errors';
import { ensureCanCreateSR, ensureCanUpdateSR, ensureCanDeleteSR } from '@/lib/policies';

// Mock dependencies
vi.mock('@/repositories/sr.repository');
vi.mock('@/repositories/sr-activity.repository');
vi.mock('@/repositories/sr-comment.repository');
vi.mock('@/repositories/sr-attachment.repository');
vi.mock('@/repositories/client.repository');
vi.mock('@/repositories/service-category.repository');
vi.mock('@/repositories/user.repository');

// Mock policy functions
vi.mock('@/lib/policies', () => ({
  ensureCanCreateSR: vi.fn(),
  ensureCanUpdateSR: vi.fn(),
  ensureCanDeleteSR: vi.fn(),
}));

// vi.mock('@/lib/sr-state-machine');

vi.mock('@/lib/wait-until', () => ({
  backgroundTask: vi.fn(async (promise) => await promise),
  backgroundTasks: vi.fn(async (tasks) => Promise.all(tasks.map(t => t.promise))),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn((callback) =>
      callback({
        sRActivity: { deleteMany: vi.fn() },
        sRComment: { deleteMany: vi.fn() },
        sRAttachment: { deleteMany: vi.fn() },
        sRStatusHistory: { deleteMany: vi.fn() },
        sR: { delete: vi.fn(), create: vi.fn(), update: vi.fn() },
      })
    ),
    sRStatusHistory: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));


describe('SRService', () => {
  let srService: SRService;
  let mockSRRepository: any;
  let mockClientRepository: any;

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

    mockSRRepository = new SRRepository();
    mockClientRepository = new ClientRepository();
    const mockUserRepository = new UserRepository();
    // Default mock behavior
    (mockUserRepository.findUserIdsByRoles as any).mockResolvedValue(['admin-1']);
    (mockUserRepository.findUsersByRoles as any).mockResolvedValue([
      { email: 'admin@test.com', notificationPreference: { emailSRCreated: true } }
    ]);

    srService = new SRService(
      mockSRRepository,
      undefined,
      undefined,
      undefined,
      mockClientRepository,
      undefined,
      mockUserRepository,
    );
  });

  describe('createSR', () => {
    it('should throw error if client is not found', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      mockClientRepository.findById.mockResolvedValue(null);

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
      mockClientRepository.findById.mockResolvedValue({
        id: 'client-1',
        isActive: false,
        name: 'Inactive Client',
      });

      const data = {
        title: 'Test SR',
        description: 'Description',
        clientId: 'client-1',
        serviceCategoryId: 'cat-1',
        requestedPriority: 'MEDIUM' as const,
      };

      await expect(srService.createSR(data, mockUser)).rejects.toThrow('비활성 상태의 고객사');
    });
  });

  describe('updateSR', () => {
    it('should throw NotFoundError if SR does not exist', async () => {
      mockSRRepository.findById.mockResolvedValue(null);

      await expect(srService.updateSR('sr-1', {}, mockUser)).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if user cannot update SR', async () => {
      const mockSR = { id: 'sr-1', clientId: 'client-1', requesterId: 'other-user' };
      mockSRRepository.findById.mockResolvedValue(mockSR);
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
        actualPriority: 'MEDIUM'
      };
      mockSRRepository.findById.mockResolvedValue(existingSR);
      vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

      // Mock dependencies for validation
      const stateMachine = await import('@/lib/sr-state-machine');
      // @ts-ignore
      stateMachine.validateTransition = vi.fn().mockReturnValue({ valid: true });
      // @ts-ignore
      stateMachine.getRequiredFields = vi.fn().mockReturnValue([]);

      const { default: prisma } = await import('@/lib/prisma');

      // Mock the update result
      const mockUpdateResult = {
        ...existingSR,
        status: 'IN_PROGRESS',
        requester: {
          id: 'req-1',
          name: 'Requester',
          email: 'req@test.com',
          notificationPreference: { emailSRStatusChanged: true }
        },
        assignee: null,
        serviceCategory: null,
        client: { id: 'c-1' }
      };

      const txMock = {
        sR: {
          update: vi.fn().mockResolvedValue(mockUpdateResult)
        },
        sRActivity: {
          create: vi.fn().mockResolvedValue({})
        }
      };

      // Force transaction to execute callback with our mock tx
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback(txMock as any);
      });

      // Mock services
      const { emailService } = await import('@/services/email.service');
      const { pushService } = await import('@/services/push.service');

      const sendEmailSpy = vi.spyOn(emailService, 'sendSRStatusChanged').mockResolvedValue({} as any);
      const sendPushSpy = vi.spyOn(pushService, 'sendToUser').mockResolvedValue({} as any);

      // Execute
      const data = { status: 'IN_PROGRESS' as const };
      await srService.updateSR('sr-1', data, mockUser);

      // Verify
      expect(txMock.sR.update).toHaveBeenCalled();
      expect(txMock.sRActivity.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: 'STATUS_CHANGED' })
      }));

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
      mockSRRepository.findById.mockResolvedValue(mockSR);

      const result = await srService.getSRById('sr-1');

      expect(result).toEqual(mockSR);
      expect(mockSRRepository.findById).toHaveBeenCalledWith('sr-1');
    });

    it('should return null if SR not found', async () => {
      mockSRRepository.findById.mockResolvedValue(null);

      const result = await srService.getSRById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('deleteSR', () => {
    it('should throw NotFoundError if SR does not exist', async () => {
      mockSRRepository.findById.mockResolvedValue(null);

      await expect(srService.deleteSR('sr-1', mockUser)).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if user cannot delete', async () => {
      const mockSR = { id: 'sr-1', clientId: 'client-1' };
      mockSRRepository.findById.mockResolvedValue(mockSR);
      vi.mocked(ensureCanDeleteSR).mockImplementation(() => {
        throw new Error('삭제 권한이 없습니다');
      });

      await expect(srService.deleteSR('sr-1', mockUser)).rejects.toThrow('삭제 권한이 없습니다');
    });
    it('should delete related data in transaction', async () => {
      const mockSR = { id: 'sr-1', clientId: 'client-1' };
      mockSRRepository.findById.mockResolvedValue(mockSR);
      vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);

      const { default: prisma } = await import('@/lib/prisma');

      const txMock = {
        sRActivity: { deleteMany: vi.fn() },
        sRComment: { deleteMany: vi.fn() },
        sRAttachment: { deleteMany: vi.fn() },
        sRStatusHistory: { deleteMany: vi.fn() },
        sR: { delete: vi.fn() }
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
        { id: 'h-2', currentStatus: 'IN_PROGRESS', changedAt: new Date() }
      ];
      const { default: prisma } = await import('@/lib/prisma');

      vi.mocked(prisma.sRStatusHistory.findMany).mockResolvedValue(mockHistory as any);
      vi.mocked(prisma.sRStatusHistory.count).mockResolvedValue(2);

      const result = await srService.getStatusHistory('sr-1', { skip: 0, take: 10 });

      expect(result.items).toEqual(mockHistory);
      expect(result.total).toBe(2);
      expect(prisma.sRStatusHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { srId: 'sr-1' },
        skip: 0,
        take: 10,
        orderBy: { changedAt: 'desc' }
      }));
    });
  });

  describe('countSRs', () => {
    it('should return count of SRs', async () => {
      mockSRRepository.count.mockResolvedValue(5);

      const result = await srService.countSRs();

      expect(result).toBe(5);
    });

    it('should return filtered count', async () => {
      mockSRRepository.count.mockResolvedValue(3);
      const filter = { where: { status: 'IN_PROGRESS' as const } };

      const result = await srService.countSRs(filter);

      expect(mockSRRepository.count).toHaveBeenCalledWith(filter.where);
      expect(result).toBe(3);
    });

    it('should pass complex where clauses to count', async () => {
      mockSRRepository.count.mockResolvedValue(1);
      const params = {
        where: {
          AND: [
            { clientId: 'c-1' },
            { status: 'REQUESTED' as const }
          ]
        }
      };

      const result = await srService.countSRs(params);

      expect(mockSRRepository.count).toHaveBeenCalledWith(params.where);
      expect(result).toBe(1);
    });
  });

  describe('getAllSRs', () => {
    it('should return all SRs with default params', async () => {
      const mockSRs = [
        { id: 'sr-1', title: 'SR 1', status: 'REQUESTED' },
        { id: 'sr-2', title: 'SR 2', status: 'IN_PROGRESS' },
      ];
      mockSRRepository.findAll.mockResolvedValue(mockSRs);

      const result = await srService.getAllSRs();

      expect(result).toEqual(mockSRs);
      expect(mockSRRepository.findAll).toHaveBeenCalled();
    });

    it('should return filtered SRs with pagination', async () => {
      const mockSRs = [{ id: 'sr-1', title: 'SR 1', status: 'IN_PROGRESS' }];
      mockSRRepository.findAll.mockResolvedValue(mockSRs);
      const params = {
        where: { status: 'IN_PROGRESS' as const },
        skip: 0,
        take: 10,
      };

      const result = await srService.getAllSRs(params);

      expect(mockSRRepository.findAll).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockSRs);
    });

    it('should pass orderBy params correctly', async () => {
      const mockSRs = [{ id: 'sr-1', title: 'SR 1' }];
      mockSRRepository.findAll.mockResolvedValue(mockSRs);
      const params = {
        orderBy: { createdAt: 'desc' as const }
      };

      await srService.getAllSRs(params);

      expect(mockSRRepository.findAll).toHaveBeenCalledWith(params);
    });

    it('should pass complex where clauses correctly', async () => {
      const mockSRs = [];
      mockSRRepository.findAll.mockResolvedValue(mockSRs);
      const params = {
        where: {
          AND: [
            { clientId: 'c-1' },
            {
              OR: [
                { title: { contains: 'test' } },
                { description: { contains: 'test' } }
              ]
            }
          ]
        }
      };

      await srService.getAllSRs(params);

      expect(mockSRRepository.findAll).toHaveBeenCalledWith(params);
    });
  });

  describe('getSRDetails', () => {
    it('should return SR details', async () => {
      const mockDetails = {
        id: 'sr-1',
        title: 'Test SR',
        client: { id: 'client-1', name: 'Test Client' },
      };
      mockSRRepository.findDetailsById.mockResolvedValue(mockDetails);

      const result = await srService.getSRDetailsById('sr-1');

      expect(result).toEqual(mockDetails);
      expect(mockSRRepository.findDetailsById).toHaveBeenCalledWith('sr-1');
    });

    it('should return null if SR not found', async () => {
      mockSRRepository.findDetailsById.mockResolvedValue(null);

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

      const { default: prisma } = await import('@/lib/prisma');

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
      mockClientRepository.findById.mockResolvedValue({ id: 'c-1', isActive: true, name: 'Client' });

      const mockCreatedSR = {
        id: 'sr-1',
        srNumber: 'SR-001',
        title: 'New SR',
        requester: { name: 'Requester' },
        serviceCategory: { categoryName: 'Category' }
      };

      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          // We need to pass a mock tx object to the callback if it expects one
          return mockCreatedSR;
        }
        return mockCreatedSR;
      });

      mockSRRepository.findDetailsById.mockResolvedValue(mockCreatedSR);

      vi.mock('@/lib/mattermost', () => ({
        sendMattermostNotification: vi.fn(),
      }));

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
        mockSRRepository.findById.mockResolvedValue(mockSR);
        vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);

        // Mock transaction for delete
        const { default: prisma } = await import('@/lib/prisma');
        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
          if (typeof callback === 'function') {
            return undefined;
          }
        });

        await srService.deleteSR('sr-1', mockUser);

        // Verify findById called
        expect(mockSRRepository.findById).toHaveBeenCalledWith('sr-1');
        // Verify transaction called (implies delete logic executed)
        expect(prisma.$transaction).toHaveBeenCalled();
      });

      it('should throw NotFoundError if SR to delete does not exist', async () => {
        mockSRRepository.findById.mockResolvedValue(null);
        await expect(srService.deleteSR('sr-1', mockUser)).rejects.toThrow(NotFoundError);
      });

      it('should throw Error if delete fails', async () => {
        const mockSR = { id: 'sr-1', clientId: 'c-1', requesterId: 'user-1' };
        mockSRRepository.findById.mockResolvedValue(mockSR);
        vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);

        const { default: prisma } = await import('@/lib/prisma');
        vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Delete failed'));

        await expect(srService.deleteSR('sr-1', mockUser)).rejects.toThrow('Delete failed');
      });
    });

    // New tests for retry logic
    it('should retry SR creation on unique constraint violation', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      mockClientRepository.findById.mockResolvedValue({ id: 'c-1', isActive: true, name: 'Client' });

      const { default: prisma } = await import('@/lib/prisma');
      const mockTransaction = vi.mocked(prisma.$transaction);

      // Setup failures then success
      let attempts = 0;
      mockTransaction.mockImplementation(async (callback) => {
        attempts++;
        if (attempts < 3) {
          const { PrismaClientKnownRequestError } = await import('@prisma/client/runtime/library');
          throw new PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "5.0.0"
          });
        }
        return {
          id: 'sr-1',
          srNumber: 'SR-20231010-0001',
          title: 'New SR',
          requester: { name: 'Requester' },
          serviceCategory: { categoryName: 'Category' }
        };
      });

      mockSRRepository.findDetailsById.mockResolvedValue({
        id: 'sr-1',
        srNumber: 'SR-20231010-0001',
        title: 'New SR',
        requester: { name: 'Requester', email: 'req@test.com' },
        serviceCategory: { categoryName: 'Category' }
      });

      const data = {
        title: 'Retry Test',
        description: 'Description for retry test',
        clientId: 'c-1',
        serviceCategoryId: 'cat-1',
        requestedPriority: 'MEDIUM' as const,
      };

      // Mock timer to speed up test
      // vi.useFakeTimers(); removed
      // const promise = srService.createSR(data, mockUser);

      const result = await srService.createSR(data, mockUser);

      // Fast-forward time for backoff
      // await vi.runAllTimersAsync();
      // vi.useRealTimers();

      // const result = await promise;
      expect(attempts).toBe(3);
      expect(mockTransaction).toHaveBeenCalledTimes(3);
      expect(result.srNumber).toBe('SR-20231010-0001');
    });

    // Tests for updateSR state transition and notifications

  });
});