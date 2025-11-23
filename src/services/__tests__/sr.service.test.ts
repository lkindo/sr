import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SRService } from '../sr.service';
import prisma from '@/lib/prisma';

// Mock all repositories
vi.mock('@/repositories/sr.repository', () => {
  const mockFindById = vi.fn();
  const mockFindDetailsById = vi.fn();
  const mockFindAll = vi.fn();
  const mockCreate = vi.fn();
  const mockUpdate = vi.fn();
  const mockCount = vi.fn();
  const mockDelete = vi.fn();

  class MockSRRepository {
    findById = mockFindById;
    findDetailsById = mockFindDetailsById;
    findAll = mockFindAll;
    create = mockCreate;
    update = mockUpdate;
    count = mockCount;
    delete = mockDelete;
  }

  return {
    SRRepository: MockSRRepository,
  };
});

vi.mock('@/repositories/sr-activity.repository', () => ({
  SRActivityRepository: class MockSRActivityRepository {
    create = vi.fn();
  },
}));

vi.mock('@/repositories/sr-comment.repository', () => ({
  SRCommentRepository: class MockSRCommentRepository {
    countBySrs = vi.fn();
  },
}));

vi.mock('@/repositories/sr-attachment.repository', () => ({
  SRAttachmentRepository: class MockSRAttachmentRepository {
    countBySrs = vi.fn();
  },
}));

vi.mock('@/repositories/client.repository', () => ({
  ClientRepository: class MockClientRepository { },
}));

vi.mock('@/repositories/service-category.repository', () => ({
  ServiceCategoryRepository: class MockServiceCategoryRepository { },
}));

vi.mock('@/lib/policies/sr.policy', () => ({
  SRPolicy: class MockSRPolicy {
    canCreate = vi.fn().mockReturnValue(true);
    canRead = vi.fn().mockReturnValue(true);
    canUpdate = vi.fn().mockReturnValue(true);
    canDelete = vi.fn().mockReturnValue(true);
    ensureCanCreate = vi.fn();
    ensureCanRead = vi.fn();
    ensureCanUpdate = vi.fn();
    ensureCanDelete = vi.fn();
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn((callback) => callback({
      sR: { update: vi.fn(), delete: vi.fn() },
      sRActivity: { create: vi.fn(), deleteMany: vi.fn() },
      sRComment: { deleteMany: vi.fn() },
      sRAttachment: { deleteMany: vi.fn() },
      sRStatusHistory: { deleteMany: vi.fn() },
    })),
  },
}));

describe('SRService', () => {
  let srService: SRService;
  let mockSRRepo: any;
  let mockActivityRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    srService = new SRService();
    mockSRRepo = (srService as any).srRepository;
    mockActivityRepo = (srService as any).srActivityRepository;
  });

  describe('createSR', () => {
    it('성공적으로 SR을 생성해야 함', async () => {
      const srData = {
        title: 'Test SR',
        description: 'Test description',
        clientId: 'client1',
        serviceCategoryId: 'category1',
        requestedPriority: 'MEDIUM' as const,
        requesterId: 'requester1',
      };

      const sessionUser = {
        id: 'user1',
        email: 'user@example.com',
        name: 'Test User',
        image: null,
        roles: ['USER'],
        permissions: ['sr:create'],
      };

      const createdSR = {
        id: 'sr1',
        srNumber: 'SR-20241114-0001',
        title: srData.title,
        description: srData.description,
        status: 'REQUESTED',
        priority: 'MEDIUM',
        clientId: srData.clientId,
        serviceCategoryId: srData.serviceCategoryId,
        requesterId: srData.requesterId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSRRepo.count.mockResolvedValue(0);
      mockSRRepo.create.mockResolvedValue(createdSR);
      mockSRRepo.findDetailsById.mockResolvedValue(createdSR);
      mockActivityRepo.create.mockResolvedValue({});

      const result = await srService.createSR(srData, sessionUser);

      expect(result).toEqual(createdSR);
      expect(mockSRRepo.count).toHaveBeenCalled();
      expect(mockSRRepo.create).toHaveBeenCalled();
      expect(mockActivityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          srId: 'sr1',
          type: 'CREATED',
          userId: 'user1',
        })
      );
    });

    it('SR 번호를 오늘 날짜와 순번으로 생성해야 함', async () => {
      const srData = {
        title: 'Test SR',
        description: 'Test description',
        clientId: 'client1',
        serviceCategoryId: 'category1',
        requestedPriority: 'MEDIUM' as const,
        requesterId: 'requester1',
      };

      const sessionUser = {
        id: 'user1',
        email: 'user@example.com',
        name: 'Test User',
        image: null,
        roles: ['USER'],
        permissions: ['sr:create'],
      };

      const createdSR = {
        id: 'sr1',
        srNumber: 'SR-20241114-0003',
        title: srData.title,
        description: srData.description,
        status: 'REQUESTED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSRRepo.count.mockResolvedValue(2);
      mockSRRepo.create.mockResolvedValue(createdSR);
      mockSRRepo.findDetailsById.mockResolvedValue(createdSR);
      mockActivityRepo.create.mockResolvedValue({});

      const result = await srService.createSR(srData, sessionUser);

      expect(mockSRRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          srNumber: expect.stringMatching(/^SR-\d{8}-\d{4}$/),
        })
      );
    });

    it('선택적 필드가 없어도 SR을 생성할 수 있어야 함', async () => {
      const srData = {
        title: 'Minimal SR',
        description: 'Minimal description',
        clientId: 'client1',
        serviceCategoryId: 'category1',
        requestedPriority: 'LOW' as const,
        requesterId: 'requester1',
      };

      const sessionUser = {
        id: 'user1',
        email: 'user@example.com',
        name: 'Test User',
        image: null,
        roles: ['USER'],
        permissions: ['sr:create'],
      };

      const createdSR = {
        id: 'sr1',
        srNumber: 'SR-20241114-0001',
        ...srData,
        status: 'REQUESTED',
        priority: null,
        assigneeId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSRRepo.count.mockResolvedValue(0);
      mockSRRepo.create.mockResolvedValue(createdSR);
      mockSRRepo.findDetailsById.mockResolvedValue(createdSR);
      mockActivityRepo.create.mockResolvedValue({});

      const result = await srService.createSR(srData, sessionUser);

      expect(result).toBeDefined();
      expect(result.id).toBe('sr1');
    });
  });

  describe('getSRById', () => {
    it('성공적으로 SR을 조회해야 함', async () => {
      const sr = {
        id: 'sr1',
        srNumber: 'SR-20241114-0001',
        title: 'Test SR',
        description: 'Test description',
        status: 'REQUESTED',
        priority: 'MEDIUM',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSRRepo.findById.mockResolvedValue(sr);

      const result = await srService.getSRById('sr1');

      expect(result).toEqual(sr);
      expect(mockSRRepo.findById).toHaveBeenCalledWith('sr1');
    });

    it('존재하지 않는 SR ID면 null을 반환해야 함', async () => {
      mockSRRepo.findById.mockResolvedValue(null);

      const result = await srService.getSRById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAllSRs', () => {
    it('모든 SR 목록을 조회해야 함', async () => {
      const srs = [
        {
          id: 'sr1',
          srNumber: 'SR-20241114-0001',
          title: 'Test SR 1',
          status: 'REQUESTED',
          assignee: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'sr2',
          srNumber: 'SR-20241114-0002',
          title: 'Test SR 2',
          status: 'IN_PROGRESS',
          assignee: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockCommentRepo = (srService as any).srCommentRepository;
      const mockAttachmentRepo = (srService as any).srAttachmentRepository;

      mockSRRepo.findAll.mockResolvedValue(srs);
      mockCommentRepo.countBySrs.mockResolvedValue([]);
      mockAttachmentRepo.countBySrs.mockResolvedValue([]);

      const result = await srService.getAllSRs({});

      expect(result).toHaveLength(2);
      expect(mockSRRepo.findAll).toHaveBeenCalled();
    });

    it('필터가 있으면 필터링된 결과를 반환해야 함', async () => {
      const filteredSRs = [
        {
          id: 'sr1',
          srNumber: 'SR-20241114-0001',
          title: 'Test SR 1',
          status: 'REQUESTED',
          assignee: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockCommentRepo = (srService as any).srCommentRepository;
      const mockAttachmentRepo = (srService as any).srAttachmentRepository;

      mockSRRepo.findAll.mockResolvedValue(filteredSRs);
      mockCommentRepo.countBySrs.mockResolvedValue([]);
      mockAttachmentRepo.countBySrs.mockResolvedValue([]);

      const result = await srService.getAllSRs({
        where: { status: 'REQUESTED' },
      });

      expect(result).toHaveLength(1);
      expect(mockSRRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'REQUESTED' },
        })
      );
    });

    it('빈 배열을 반환할 수 있어야 함', async () => {
      const mockCommentRepo = (srService as any).srCommentRepository;
      const mockAttachmentRepo = (srService as any).srAttachmentRepository;

      mockSRRepo.findAll.mockResolvedValue([]);
      mockCommentRepo.countBySrs.mockResolvedValue([]);
      mockAttachmentRepo.countBySrs.mockResolvedValue([]);

      const result = await srService.getAllSRs({});

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('getSRDetailsById', () => {
    it('상세 정보를 포함하여 SR을 조회해야 함', async () => {
      const mockSR = {
        id: 'sr1',
        srNumber: 'SR-20241114-0001',
        title: 'Test SR',
        _count: {
          comments: 5,
          attachments: 2,
        },
      };

      mockSRRepo.findDetailsById.mockResolvedValue(mockSR);

      const result = await srService.getSRDetailsById('sr1');

      expect(result).toEqual(mockSR);
      expect(mockSRRepo.findDetailsById).toHaveBeenCalledWith('sr1');
    });

    it('존재하지 않는 SR의 상세 정보는 null을 반환해야 함', async () => {
      mockSRRepo.findDetailsById.mockResolvedValue(null);

      const result = await srService.getSRDetailsById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('countSRs', () => {
    it('SR 개수를 반환해야 함', async () => {
      mockSRRepo.count.mockResolvedValue(10);

      const result = await srService.countSRs({});

      expect(result).toBe(10);
      expect(mockSRRepo.count).toHaveBeenCalled();
    });

    it('필터가 있으면 필터링된 개수를 반환해야 함', async () => {
      mockSRRepo.count.mockResolvedValue(5);

      const result = await srService.countSRs({
        where: { status: 'REQUESTED' },
      });

      expect(result).toBe(5);
      expect(mockSRRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'REQUESTED' })
      );
    });

    it('SR이 없으면 0을 반환해야 함', async () => {
      mockSRRepo.count.mockResolvedValue(0);

      const result = await srService.countSRs({});

      expect(result).toBe(0);
    });
  });

  describe('updateSR', () => {
    const sessionUser = {
      id: 'user1',
      email: 'user@example.com',
      name: 'Test User',
      image: null,
      roles: ['USER'],
      permissions: ['sr:update'],
    };

    const existingSR = {
      id: 'sr1',
      srNumber: 'SR-20241114-0001',
      title: 'Original Title',
      description: 'Original Description',
      status: 'REQUESTED',
      priority: 'MEDIUM',
      createdAt: new Date(),
      updatedAt: new Date(),
      assigneeId: null,
      intakeById: null,
      resolutionDescription: null,
      rejectionReason: null,
    };

    it('유효하지 않은 상태 변경 시 에러를 던져야 함 (REQUESTED -> COMPLETED)', async () => {
      mockSRRepo.findById.mockResolvedValue(existingSR);

      await expect(srService.updateSR('sr1', { status: 'COMPLETED' }, sessionUser))
        .rejects.toThrow('유효하지 않은 상태 변경입니다');
    });

    it('INTAKE 상태로 변경 시 접수자가 없으면 현재 사용자로 지정해야 함', async () => {
      mockSRRepo.findById.mockResolvedValue(existingSR);

      const updatedSR = {
        ...existingSR,
        status: 'INTAKE',
        intakeById: sessionUser.id,
        intakeAt: new Date(),
        client: { id: 'client1', code: 'C001', name: 'Test Client' },
        requester: { id: 'user1', name: 'Test User', email: 'user@example.com' },
        assignee: null,
        serviceCategory: { id: 'cat1', categoryName: 'Test Category' },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          sR: {
            update: vi.fn().mockResolvedValue(updatedSR)
          },
          sRActivity: {
            create: vi.fn().mockResolvedValue({})
          },
        });
      });

      const result = await srService.updateSR('sr1', { status: 'INTAKE' }, sessionUser);

      expect(result.status).toBe('INTAKE');
      expect(result.intakeById).toBe(sessionUser.id);
      expect(result.intakeAt).toBeDefined();
    });

    it('IN_PROGRESS 상태로 변경 시 담당자가 없으면 에러를 던져야 함', async () => {
      const intakeSR = { ...existingSR, status: 'INTAKE', intakeById: 'user1' };
      mockSRRepo.findById.mockResolvedValue(intakeSR);

      await expect(srService.updateSR('sr1', { status: 'IN_PROGRESS' }, sessionUser))
        .rejects.toThrow('진행 상태로 변경하려면 담당자가 지정되어야 합니다');
    });

    it('COMPLETED 상태로 변경 시 처리 내용이 없으면 에러를 던져야 함', async () => {
      const progressSR = { ...existingSR, status: 'IN_PROGRESS', assigneeId: 'user1' };
      mockSRRepo.findById.mockResolvedValue(progressSR);

      await expect(srService.updateSR('sr1', { status: 'COMPLETED' }, sessionUser))
        .rejects.toThrow('완료 상태로 변경하려면 처리 내용을 입력해야 합니다');
    });

    it('REJECTED 상태로 변경 시 반려 사유가 없으면 에러를 던져야 함', async () => {
      mockSRRepo.findById.mockResolvedValue(existingSR);

      await expect(srService.updateSR('sr1', { status: 'REJECTED' }, sessionUser))
        .rejects.toThrow('반려 상태로 변경하려면 반려 사유를 입력해야 합니다');
    });
  });

  describe('deleteSR', () => {
    it('SR 삭제 시 활동 기록을 생성해야 함', async () => {
      const sr = {
        id: 'sr1',
        srNumber: 'SR-20241114-0001',
        title: 'Test SR',
        status: 'REQUESTED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSRRepo.findById.mockResolvedValue(sr);
      mockSRRepo.delete.mockResolvedValue(sr);
      mockActivityRepo.create.mockResolvedValue({});

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        return callback({
          sRActivity: { deleteMany: vi.fn() },
          sRComment: { deleteMany: vi.fn() },
          sRAttachment: { deleteMany: vi.fn() },
          sRStatusHistory: { deleteMany: vi.fn() },
          sR: { delete: mockSRRepo.delete },
        } as any);
      });

      const result = await srService.deleteSR('sr1', { id: 'user1' } as any);
      expect(result).toBeUndefined();
      expect(mockSRRepo.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sr1' } }));
    });
  });
});
