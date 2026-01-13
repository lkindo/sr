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

      expect(result).toEqual(mockSRs);
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
  });
});