import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SRRepository } from '../sr.repository';
import prisma from '@/lib/prisma';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    sR: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('SRRepository', () => {
  let repository: SRRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new SRRepository();
  });

  describe('findDetailsById', () => {
    it('상세 정보를 포함하여 SR을 조회해야 함', async () => {
      const mockSR = {
        id: 'sr1',
        srNumber: 'SR-20241114-0001',
        title: 'Test SR',
        client: { id: 'client1', name: 'Test Client' },
        requester: { id: 'user1', name: 'Test User', email: 'user@example.com' },
        assignee: null,
        serviceCategory: { id: 'cat1', categoryName: 'Test Category' },
        comments: [],
        activities: [],
        attachments: [],
        _count: { comments: 0, attachments: 0 },
      };

      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);

      const result = await repository.findDetailsById('sr1');

      expect(result).toEqual(mockSR);
      expect(prisma.sR.findUnique).toHaveBeenCalledWith({
        where: { id: 'sr1' },
        include: expect.objectContaining({
          client: true,
          requester: expect.any(Object),
          assignee: expect.any(Object),
          serviceCategory: true,
        }),
      });
    });

    it('존재하지 않는 SR은 null을 반환해야 함', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);

      const result = await repository.findDetailsById('nonexistent');

      expect(result).toBeNull();
    });

    it('커스텀 limit 옵션을 적용해야 함', async () => {
      vi.mocked(prisma.sR.findUnique).mockResolvedValue(null);

      await repository.findDetailsById('sr1', { activitiesLimit: 5, commentsLimit: 10 });

      expect(prisma.sR.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sr1' },
          include: expect.objectContaining({
            activities: expect.objectContaining({ take: 5 }),
            comments: expect.objectContaining({ take: 10 }),
          }),
        })
      );
    });
  });

  describe('findById', () => {
    it('기본 정보만 포함하여 SR을 조회해야 함', async () => {
      const mockSR = {
        id: 'sr1',
        srNumber: 'SR-20241114-0001',
        title: 'Test SR',
      };

      vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any);

      const result = await repository.findById('sr1');

      expect(result).toEqual(mockSR);
      expect(prisma.sR.findUnique).toHaveBeenCalledWith({
        where: { id: 'sr1' },
      });
    });
  });

  describe('findAll', () => {
    it('모든 SR을 조회해야 함', async () => {
      const mockSRs = [
        { id: 'sr1', title: 'SR 1', client: { id: 'c1', name: 'Client 1' } },
        { id: 'sr2', title: 'SR 2', client: { id: 'c2', name: 'Client 2' } },
      ];

      vi.mocked(prisma.sR.findMany).mockResolvedValue(mockSRs as any);

      const result = await repository.findAll();

      expect(result).toEqual(mockSRs);
      expect(prisma.sR.findMany).toHaveBeenCalled();
    });

    it('페이지네이션 파라미터를 적용해야 함', async () => {
      vi.mocked(prisma.sR.findMany).mockResolvedValue([]);

      await repository.findAll({ skip: 10, take: 5 });

      expect(prisma.sR.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 })
      );
    });

    it('필터 조건을 적용해야 함', async () => {
      vi.mocked(prisma.sR.findMany).mockResolvedValue([]);

      await repository.findAll({ where: { status: 'OPEN' as any } });

      expect(prisma.sR.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'OPEN' } })
      );
    });
  });

  describe('create', () => {
    it('새 SR을 생성해야 함', async () => {
      const createData = {
        title: 'New SR',
        description: 'Description',
        clientId: 'client1',
        requesterId: 'user1',
        serviceCategoryId: 'cat1',
      };
      const mockCreatedSR = {
        id: 'sr-new',
        srNumber: 'SR-20241114-0002',
        ...createData,
        client: { id: 'client1', name: 'Client' },
        requester: { id: 'user1', name: 'User' },
        assignee: null,
      };

      vi.mocked(prisma.sR.create).mockResolvedValue(mockCreatedSR as any);

      const result = await repository.create(createData as any);

      expect(result).toEqual(mockCreatedSR);
      expect(prisma.sR.create).toHaveBeenCalledWith({
        data: expect.objectContaining(createData),
        include: expect.objectContaining({
          client: true,
          requester: true,
          assignee: true,
        }),
      });
    });
  });

  describe('update', () => {
    it('SR을 업데이트해야 함', async () => {
      const updateData = { title: 'Updated Title', status: 'IN_PROGRESS' };
      const mockUpdatedSR = {
        id: 'sr1',
        ...updateData,
        client: { id: 'client1' },
        requester: { id: 'user1' },
        assignee: null,
      };

      vi.mocked(prisma.sR.update).mockResolvedValue(mockUpdatedSR as any);

      const result = await repository.update('sr1', updateData as any);

      expect(result).toEqual(mockUpdatedSR);
      expect(prisma.sR.update).toHaveBeenCalledWith({
        where: { id: 'sr1' },
        data: updateData,
        include: expect.any(Object),
      });
    });
  });

  describe('count', () => {
    it('전체 SR 수를 반환해야 함', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(42);

      const result = await repository.count();

      expect(result).toBe(42);
      expect(prisma.sR.count).toHaveBeenCalledWith({ where: {} });
    });

    it('필터 조건으로 카운트해야 함', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(10);

      const result = await repository.count({ status: 'OPEN' as any });

      expect(result).toBe(10);
      expect(prisma.sR.count).toHaveBeenCalledWith({ where: { status: 'OPEN' } });
    });
  });

  describe('countByStatus', () => {
    it('상태별 SR 수를 반환해야 함', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(5);

      const result = await repository.countByStatus('client1', 'OPEN' as any);

      expect(result).toBe(5);
      expect(prisma.sR.count).toHaveBeenCalledWith({
        where: { clientId: 'client1', status: 'OPEN' },
      });
    });

    it('고객사 ID만으로 카운트해야 함', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(15);

      const result = await repository.countByStatus('client1');

      expect(result).toBe(15);
      expect(prisma.sR.count).toHaveBeenCalledWith({
        where: { clientId: 'client1' },
      });
    });

    it('파라미터 없이 전체 카운트해야 함', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(100);

      const result = await repository.countByStatus();

      expect(result).toBe(100);
      expect(prisma.sR.count).toHaveBeenCalledWith({ where: {} });
    });
  });

  describe('countByPriority', () => {
    it('우선순위별 SR 수를 반환해야 함', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(8);

      const result = await repository.countByPriority('client1', 'HIGH' as any);

      expect(result).toBe(8);
      expect(prisma.sR.count).toHaveBeenCalledWith({
        where: { clientId: 'client1', priority: 'HIGH' },
      });
    });
  });

  describe('findByClientId', () => {
    it('고객사별 SR 목록과 총 개수를 반환해야 함', async () => {
      const mockSRs = [{ id: 'sr1' }, { id: 'sr2' }];
      vi.mocked(prisma.sR.findMany).mockResolvedValue(mockSRs as any);
      vi.mocked(prisma.sR.count).mockResolvedValue(2);

      const result = await repository.findByClientId('client1');

      expect(result.data).toEqual(mockSRs);
      expect(result.totalCount).toBe(2);
    });

    it('페이지네이션 파라미터를 적용해야 함', async () => {
      vi.mocked(prisma.sR.findMany).mockResolvedValue([]);
      vi.mocked(prisma.sR.count).mockResolvedValue(0);

      await repository.findByClientId('client1', { skip: 5, take: 10 });

      expect(prisma.sR.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 10,
          where: expect.objectContaining({ clientId: 'client1' }),
        })
      );
    });
  });
});
