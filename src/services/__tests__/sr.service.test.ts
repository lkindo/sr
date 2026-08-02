import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BadRequestError,
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ServiceError,
} from '@/lib/errors';
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
    // 담당자 배정 가능 여부 판정(getUsersWithSRHandlingPermission)은 user.findMany 한 번으로
    // "내부 역할 + 담당자 필수 권한"을 함께 조회한다. role 은 다른 조회 경로용 기본 스텁이다.
    role: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  return { mockPrisma: mock };
});

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
}));

// Mock policy functions
// ensure* 만 스텁으로 대체하고 isInternalUser 는 실제 구현을 그대로 사용한다.
// (테넌트 경계 판정을 mock 반환값으로 조작하지 않아야, 픽스처의 roles/clientIds 가
//  실제 서비스에서와 동일한 분기를 타는지 검증할 수 있다.)
vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return {
    ...actual,
    ensureCanCreateSR: vi.fn(),
    ensureCanUpdateSR: vi.fn(),
    ensureCanDeleteSR: vi.fn(),
  };
});

vi.mock('@/lib/sr-state-machine', () => ({
  validateTransition: vi.fn().mockReturnValue({ valid: true }),
  getRequiredFields: vi.fn().mockReturnValue([]),
}));

describe('SRService', () => {
  let srService: SRService;
  // no repository mocks needed here

  // 외부(고객사) 사용자. 이 스위트가 다루는 고객사 3곳에 모두 소속되어 있으므로
  // 테넌트 가드를 통과하며, 각 테스트가 검증하려는 후속 분기까지 도달한다.
  // (isInternalUser 는 실제 구현이므로 roles 에 내부 역할이 없으면 외부 사용자로 판정된다.)
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    roles: ['USER'],
    permissions: [],
    clientIds: ['client-1', 'c-1', 'c-2'],
  };

  // 다른 테넌트에 소속된 외부 사용자. 테넌트 경계 침범 시나리오 전용.
  const foreignUser = {
    id: 'user-foreign',
    email: 'foreign@example.com',
    name: 'Foreign User',
    image: null,
    roles: ['USER'],
    permissions: [],
    clientIds: ['client-foreign'],
  };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // 카테고리 테넌트 검증 기본값: 카테고리 미존재(no-op).
    // clearAllMocks 는 구현을 되돌리지 않으므로, 경계 위반 시나리오가 뒤 테스트로 새지 않도록 명시적으로 초기화한다.
    mockPrisma.serviceCategory.findUnique.mockResolvedValue(null);

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

    it('외부 사용자가 소속되지 않은 고객사로 SR을 생성하면 ForbiddenError (고객사 조회 이전에 차단)', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      vi.mocked(prisma.client.findUnique).mockResolvedValue({
        id: 'client-1',
        isActive: true,
        name: '남의 고객사',
      } as any);

      const data = {
        title: 'Cross Tenant SR',
        description: 'Description long enough',
        clientId: 'client-1', // foreignUser 의 clientIds 에 없음
        serviceCategoryId: 'cat-1',
        requestedPriority: 'MEDIUM' as const,
      };

      await expect(srService.createSR(data, foreignUser)).rejects.toThrow(ForbiddenError);

      // 테넌트 가드가 조회보다 먼저 실행되어야 타 고객사의 존재 여부/이름이
      // 오류 메시지나 타이밍으로 새지 않는다.
      expect(prisma.client.findUnique).not.toHaveBeenCalled();
      expect(prisma.serviceCategory.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('외부 사용자가 소속된 고객사로 SR을 생성하면 정상 성공한다', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      vi.mocked(prisma.client.findUnique).mockResolvedValue({
        id: 'client-foreign',
        isActive: true,
        name: 'Own Client',
      } as any);
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null as any);

      const createdSR = { id: 'sr-own', srNumber: 'SR-OWN-0001', title: 'Own SR' };
      vi.mocked(prisma.$transaction).mockImplementation(async () => createdSR as any);
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(createdSR as any);

      const data = {
        title: 'Own Tenant SR',
        description: 'Description long enough',
        clientId: 'client-foreign', // foreignUser 가 실제로 소속된 고객사
        serviceCategoryId: 'cat-1',
        requestedPriority: 'MEDIUM' as const,
      };

      const result = await srService.createSR(data, foreignUser);

      expect(result).toEqual(createdSR);
      expect(prisma.client.findUnique).toHaveBeenCalledWith({ where: { id: 'client-foreign' } });
    });

    it('타 고객사 전용 서비스 카테고리를 사용하면 ForbiddenError', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      vi.mocked(prisma.client.findUnique).mockResolvedValue({
        id: 'client-1',
        isActive: true,
        name: 'Client',
      } as any);
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        clientId: 'other-client',
      } as any);

      const data = {
        title: 'Category Leak SR',
        description: 'Description long enough',
        clientId: 'client-1',
        serviceCategoryId: 'cat-of-other-client',
        requestedPriority: 'MEDIUM' as const,
      };

      await expect(srService.createSR(data, mockUser)).rejects.toThrow(ForbiddenError);
      // 카테고리 경계 위반은 SR 생성 트랜잭션 이전에 차단되어야 한다.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('전역 카테고리(clientId null)와 동일 고객사 카테고리는 모두 허용된다', async () => {
      vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
      vi.mocked(prisma.client.findUnique).mockResolvedValue({
        id: 'client-1',
        isActive: true,
        name: 'Client',
      } as any);

      const createdSR = { id: 'sr-ok', srNumber: 'SR-OK-0001', title: 'OK SR' };
      vi.mocked(prisma.$transaction).mockImplementation(async () => createdSR as any);
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(createdSR as any);

      const data = {
        title: 'Allowed Category SR',
        description: 'Description long enough',
        clientId: 'client-1',
        serviceCategoryId: 'cat-1',
        requestedPriority: 'MEDIUM' as const,
      };

      // 1) 전역 카테고리
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({ clientId: null } as any);
      await expect(srService.createSR(data, mockUser)).resolves.toEqual(createdSR);

      // 2) 동일 고객사 전용 카테고리
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        clientId: 'client-1',
      } as any);
      await expect(srService.createSR(data, mockUser)).resolves.toEqual(createdSR);
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

    it('should execute notification logic during transaction', async () => {
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
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
      const { domainEvents } = await import('@/lib/domain-events');
      const { registerSRNotificationListeners } =
        await import('@/services/listeners/sr-notification.listener');

      // Ensure listeners are registered
      domainEvents.removeAllListeners('sr:status_changed');
      registerSRNotificationListeners();

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        email: 'req@test.com',
        notificationPreference: { emailSRStatusChanged: true },
      } as any);

      const sendEmailSpy = vi
        .spyOn(emailService, 'sendSRStatusChanged')
        .mockResolvedValue({} as any);
      const sendPushSpy = vi.spyOn(pushService, 'sendToUser').mockResolvedValue({} as any);

      // Execute
      const data = { status: 'IN_PROGRESS' as const };
      await srService.updateSR('sr-1', data, mockUser);

      // Wait for async domain event listeners to execute
      await new Promise((resolve) => setTimeout(resolve, 15));

      // Verify
      expect(txMock.sR.update).toHaveBeenCalled();
      // Optimization: Activity creation is now nested in update, not a separate call
      expect(txMock.sRActivity.create).not.toHaveBeenCalled();

      // Verify nested activity creation
      const updateCall = vi.mocked(txMock.sR.update).mock.calls[0];
      const updateData = updateCall?.[0]?.data;
      expect(updateData?.activities?.create).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'STATUS_CHANGED' })])
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
    it('should delete SR successfully', async () => {
      const mockSR = { id: 'sr-1', clientId: 'client-1' };
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
      vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);
      vi.mocked(prisma.sR.delete).mockResolvedValue(mockSR as any);

      await srService.deleteSR('sr-1', mockUser);

      expect(prisma.sR.delete).toHaveBeenCalledWith({ where: { id: 'sr-1' } });
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
      beforeEach(() => {
        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
          if (typeof callback === 'function') {
            return await callback(prisma);
          }
          // 배열 형태 $transaction 은 이 테스트가 쓰지 않는다.
          throw new Error('배열 형태 $transaction 은 이 목이 지원하지 않습니다.');
        });
      });

      it('should delete SR successfully', async () => {
        const mockSR = { id: 'sr-1', clientId: 'c-1', requesterId: 'user-1' };
        vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
        vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);
        vi.mocked(prisma.sR.delete).mockResolvedValue(mockSR as any);

        await srService.deleteSR('sr-1', mockUser);

        // Verify findById called
        expect(prisma.sR.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'sr-1' } })
        );
        // Verify delete called
        expect(prisma.sR.delete).toHaveBeenCalledWith({ where: { id: 'sr-1' } });
      });

      it('should throw NotFoundError if SR to delete does not exist', async () => {
        vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);
        await expect(srService.deleteSR('sr-1', mockUser)).rejects.toThrow(NotFoundError);
      });

      it('should throw Error if delete fails', async () => {
        const mockSR = { id: 'sr-1', clientId: 'c-1', requesterId: 'user-1' };
        vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);
        vi.mocked(ensureCanDeleteSR).mockReturnValue(undefined);

        vi.mocked(prisma.sR.delete).mockRejectedValue(new Error('Delete failed'));

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

  // ==========================================================================
  // updateSR 필드 단위 인가 (접수/트리아지 전용 필드)
  //
  // ensureCanUpdateSR 를 통과했다는 사실만으로 운영 전용 필드까지 쓸 수 있으면
  // 고객사 관리자가 SLA 기한/실제 우선순위를 스스로 고쳐 준수율 지표를 위조하고
  // 담당 엔지니어를 조용히 재배정할 수 있다.
  // ==========================================================================
  describe('updateSR 운영 전용 필드 인가', () => {
    // 외부 고객사 관리자. 시드 기준 권한(SR CREATE/READ/UPDATE/STATUS_CHANGE)만 보유하며
    // SR:ASSIGN 은 없다 → 접수 필드에 대한 권한이 없다.
    const clientAdmin = {
      id: 'client-admin-1',
      email: 'ca@example.com',
      name: 'Client Admin',
      image: null,
      roles: ['CLIENT_ADMIN'],
      permissions: ['SR:CREATE', 'SR:READ', 'SR:UPDATE', 'SR:STATUS_CHANGE'],
      clientIds: ['c-1'],
    };

    // 외부 고객사 사용자(요청자 본인). SR:UPDATE_SELF 로 자신의 SR 만 수정 가능.
    const clientUser = {
      id: 'client-user-1',
      email: 'cu@example.com',
      name: 'Client User',
      image: null,
      roles: ['CLIENT_USER'],
      permissions: ['SR:CREATE', 'SR:READ', 'SR:UPDATE_SELF'],
      clientIds: ['c-1'],
    };

    // 내부 운영자(MANAGER). 시드 기준으로 SR 리소스 전체 권한(SR:ASSIGN 포함)을 가진다.
    const managerUser = {
      id: 'mgr-1',
      email: 'mgr@example.com',
      name: 'Manager',
      image: null,
      roles: ['MANAGER'],
      permissions: ['SR:READ', 'SR:UPDATE', 'SR:ASSIGN', 'SR:STATUS_CHANGE'],
      clientIds: [],
    };

    const existingIntakeSR = {
      id: 'sr-1',
      srNumber: 'SR-001',
      title: '기존 제목',
      description: '기존 설명입니다.',
      status: 'INTAKE',
      clientId: 'c-1',
      requesterId: 'client-user-1',
      assigneeId: 'eng-1',
      serviceCategoryId: 'cat-1',
      actualPriority: 'MEDIUM',
      estimatedHours: 8,
      intakeNotes: '기존 접수 메모',
      dueDate: new Date('2026-08-01T00:00:00.000Z'),
      estimatedCompletionDate: new Date('2026-07-30T00:00:00.000Z'),
      intakeAt: new Date('2026-07-20T00:00:00.000Z'),
    };

    let txMock: {
      sR: { updateMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
      sRActivity: { create: ReturnType<typeof vi.fn> };
    };

    beforeEach(() => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(existingIntakeSR as any);
      vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

      txMock = {
        sR: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({ ...existingIntakeSR }),
        },
        sRActivity: { create: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));
    });

    /** 갱신 트랜잭션이 아예 실행되지 않았음을 확인한다. (던지고 나서 쓰는 버그 방지) */
    const expectNoWrite = () => {
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(txMock.sR.update).not.toHaveBeenCalled();
      expect(txMock.sR.updateMany).not.toHaveBeenCalled();
    };

    it('외부 CLIENT_ADMIN이 dueDate/actualPriority/assigneeId를 변경하면 ForbiddenError이며 쓰기가 발생하지 않는다', async () => {
      await expect(
        srService.updateSR(
          'sr-1',
          {
            dueDate: '2030-01-01',
            actualPriority: 'CRITICAL',
            assigneeId: 'attacker-picked-user',
          },
          clientAdmin
        )
      ).rejects.toThrow(ForbiddenError);

      expectNoWrite();
      // 담당자 조회까지 가기 전에 인가 단계에서 차단되어야 한다.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['dueDate', { dueDate: '2030-01-01' }],
      ['actualPriority', { actualPriority: 'CRITICAL' as const }],
      ['estimatedHours', { estimatedHours: 999 }],
      // intake PATCH 라우트가 ADMIN/MANAGER 로 제한하는 필드와 동일한 집합이어야 한다.
      ['estimatedCompletionDate', { estimatedCompletionDate: '2030-02-02' }],
      ['intakeNotes', { intakeNotes: '내가 고친 접수 메모' }],
      ['assigneeId', { assigneeId: 'eng-2' }],
      ['assignedToId(별칭)', { assignedToId: 'eng-2' }],
    ])('외부 CLIENT_ADMIN의 %s 변경은 개별적으로도 차단된다', async (_label, patch) => {
      await expect(srService.updateSR('sr-1', patch as any, clientAdmin)).rejects.toThrow(
        ForbiddenError
      );
      expectNoWrite();
    });

    it('요청자 본인(CLIENT_USER)도 SR:UPDATE_SELF로 접수 필드를 바꿀 수 없다', async () => {
      await expect(
        srService.updateSR('sr-1', { actualPriority: 'CRITICAL' }, clientUser)
      ).rejects.toThrow(ForbiddenError);
      expectNoWrite();
    });

    it('외부 사용자가 동일한 값을 재전송하면(변경 없음) 통과하고 일반 필드만 반영된다', async () => {
      // 수정 다이얼로그가 전체 객체를 그대로 다시 보내는 경우를 시뮬레이션한다.
      await srService.updateSR(
        'sr-1',
        {
          title: '변경된 제목',
          dueDate: existingIntakeSR.dueDate.toISOString(),
          actualPriority: 'MEDIUM',
          estimatedHours: 8,
          estimatedCompletionDate: existingIntakeSR.estimatedCompletionDate.toISOString(),
          intakeNotes: '기존 접수 메모',
          assigneeId: 'eng-1',
        },
        clientAdmin
      );

      const updateData = vi.mocked(txMock.sR.update).mock.calls[0]![0].data;
      expect(updateData.title).toBe('변경된 제목');
      // 동일 값 재전송은 no-op 이므로 값이 바뀌지 않는다.
      expect(updateData.actualPriority).toBe('MEDIUM');
      expect(updateData.assigneeId).toBe('eng-1');
    });

    it('POSITIVE: 외부 사용자는 본인 SR의 제목/설명/만족도를 계속 수정할 수 있다', async () => {
      await srService.updateSR(
        'sr-1',
        {
          title: '새 제목입니다',
          description: '새 설명입니다. 충분히 깁니다.',
          satisfactionRating: 5,
          additionalFeedback: '감사합니다',
        },
        clientUser
      );

      const updateData = vi.mocked(txMock.sR.update).mock.calls[0]![0].data;
      expect(updateData.title).toBe('새 제목입니다');
      expect(updateData.description).toBe('새 설명입니다. 충분히 깁니다.');
      expect(updateData.satisfactionRating).toBe(5);
      expect(updateData.additionalFeedback).toBe('감사합니다');
    });

    it('POSITIVE: 내부 MANAGER는 운영 전용 필드를 모두 기록할 수 있다', async () => {
      // 새 담당자는 배정 가능한 사용자여야 한다.
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'eng-2',
        name: 'Engineer 2',
        email: 'eng2@example.com',
        isActive: true,
      } as any);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'eng-2', name: 'Engineer 2', email: 'eng2@example.com' },
      ] as any);

      await srService.updateSR(
        'sr-1',
        {
          dueDate: '2030-01-01',
          actualPriority: 'CRITICAL',
          estimatedHours: 12,
          estimatedCompletionDate: '2030-02-02',
          intakeNotes: '운영팀 메모',
          assigneeId: 'eng-2',
        },
        managerUser
      );

      const updateData = vi.mocked(txMock.sR.update).mock.calls[0]![0].data;
      expect(updateData.actualPriority).toBe('CRITICAL');
      expect(updateData.estimatedHours).toBe(12);
      expect(updateData.estimatedCompletionDate).toBeInstanceOf(Date);
      expect(updateData.intakeNotes).toBe('운영팀 메모');
      expect(updateData.assigneeId).toBe('eng-2');
      // actualPriority 변경 시 SLA 기한이 재계산되므로 dueDate 는 Date 로 기록된다.
      expect(updateData.dueDate).toBeInstanceOf(Date);
    });

    it('POSITIVE: 내부 ADMIN도 접수 필드를 기록할 수 있다', async () => {
      const adminUser = { ...managerUser, id: 'admin-1', roles: ['ADMIN'], permissions: [] };

      await srService.updateSR('sr-1', { intakeNotes: '관리자 메모' }, adminUser);

      const updateData = vi.mocked(txMock.sR.update).mock.calls[0]![0].data;
      expect(updateData.intakeNotes).toBe('관리자 메모');
    });
  });

  // ==========================================================================
  // updateSR 담당자 검증 (존재/활성/SR 처리 권한)
  // 검증이 없으면 로그인할 수 없는 담당자에게 묶인 orphan SR 이 생기고,
  // 존재하지 않는 ID 는 원시 Prisma FK 오류(500)로 새어 나간다.
  // ==========================================================================
  describe('updateSR 담당자 검증', () => {
    const managerUser = {
      id: 'mgr-1',
      email: 'mgr@example.com',
      name: 'Manager',
      image: null,
      roles: ['MANAGER'],
      permissions: ['SR:UPDATE', 'SR:ASSIGN'],
      clientIds: [],
    };

    const existingSR = {
      id: 'sr-1',
      srNumber: 'SR-001',
      title: '제목',
      status: 'INTAKE',
      clientId: 'c-1',
      requesterId: 'req-1',
      assigneeId: null,
      serviceCategoryId: 'cat-1',
      actualPriority: 'MEDIUM',
    };

    let txMock: {
      sR: { updateMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
      sRActivity: { create: ReturnType<typeof vi.fn> };
    };

    beforeEach(() => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(existingSR as any);
      vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

      txMock = {
        sR: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({ ...existingSR }),
        },
        sRActivity: { create: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));
    });

    it('비활성 사용자를 담당자로 지정하면 BadRequestError이며 쓰기가 발생하지 않는다', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'inactive-1',
        name: '퇴사자',
        email: 'gone@example.com',
        isActive: false,
      } as any);

      await expect(
        srService.updateSR('sr-1', { assigneeId: 'inactive-1' }, managerUser)
      ).rejects.toThrow(BadRequestError);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(txMock.sR.update).not.toHaveBeenCalled();
    });

    it('존재하지 않는 사용자를 담당자로 지정하면 NotFoundError이며 쓰기가 발생하지 않는다', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(
        srService.updateSR('sr-1', { assigneeId: 'ghost-1' }, managerUser)
      ).rejects.toThrow(NotFoundError);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(txMock.sR.update).not.toHaveBeenCalled();
    });

    it('SR 처리 권한이 없는 사용자(고객사 사용자 등)는 담당자로 배정할 수 없다', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'client-user-1',
        name: 'Client User',
        email: 'cu@example.com',
        isActive: true,
      } as any);
      // 담당자 선택 목록(SR 처리 권한 보유자)에 포함되지 않는다.
      vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);

      await expect(
        srService.updateSR('sr-1', { assigneeId: 'client-user-1' }, managerUser)
      ).rejects.toThrow(BadRequestError);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('POSITIVE: SR 처리 권한이 있는 활성 사용자는 정상 배정된다', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'eng-2',
        name: 'Engineer 2',
        email: 'eng2@example.com',
        isActive: true,
      } as any);
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: 'eng-2', name: 'Engineer 2', email: 'eng2@example.com' },
      ] as any);

      await srService.updateSR('sr-1', { assigneeId: 'eng-2' }, managerUser);

      const updateData = vi.mocked(txMock.sR.update).mock.calls[0]![0].data;
      expect(updateData.assigneeId).toBe('eng-2');
      expect(updateData.activities?.create).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'ASSIGNED' })])
      );
    });

    it('담당자 배정 해제(null)는 사용자 조회 없이 허용된다', async () => {
      await srService.updateSR('sr-1', { assignedToId: null }, managerUser);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      const updateData = vi.mocked(txMock.sR.update).mock.calls[0]![0].data;
      expect(updateData.assigneeId).toBeNull();
    });
  });
});
