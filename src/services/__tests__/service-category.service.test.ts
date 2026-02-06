import { SRPriority } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';

import { ServiceCategoryService } from '../service-category.service';

vi.mock('@/lib/prisma', () => ({
  default: {
    serviceCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('ServiceCategoryService', () => {
  let service: ServiceCategoryService;

  const mockCategory = {
    id: 'cat-1',
    categoryName: 'Network Support',
    description: '네트워크 지원',
    slaHours: 24,
    priority: 'MEDIUM' as SRPriority,
    clientId: 'client-1',
    handlerId: 'user-1',
    backupHandlerId: 'user-2',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ServiceCategoryService();
  });

  describe('getAll', () => {
    it('모든 서비스 카테고리를 반환해야 함', async () => {
      const mockCategories = [mockCategory];
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue(mockCategories as any);

      const result = await service.getAll();

      expect(result).toEqual(mockCategories);
      expect(prisma.serviceCategory.findMany).toHaveBeenCalled();
    });

    it('빈 배열을 반환할 수 있어야 함', async () => {
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([]);

      const result = await service.getAll();

      expect(result).toEqual([]);
      expect(prisma.serviceCategory.findMany).toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('ID로 서비스 카테고리를 조회해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        ...mockCategory,
        _count: { srs: 5 },
      } as any);

      const result = await service.getById('cat-1');

      expect(result.id).toBe('cat-1');
      expect(prisma.serviceCategory.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cat-1' } })
      );
    });

    it('존재하지 않는 카테고리는 에러를 던져야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(null);

      await expect(service.getById('non-existent')).rejects.toThrow('서비스 카테고리');
    });
  });

  describe('getByClientId', () => {
    it('고객사 ID로 카테고리 목록을 조회해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([mockCategory] as any);

      const result = await service.getByClientId('client-1');

      expect(result).toHaveLength(1);
      expect(prisma.serviceCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'client-1', isActive: true },
        })
      );
    });
  });

  describe('create', () => {
    it('새 서비스 카테고리를 생성해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceCategory.create).mockResolvedValue(mockCategory as any);

      const result = await service.create({
        categoryName: 'Network Support',
        slaHours: 24,
        priority: 'MEDIUM',
      });

      expect(result.categoryName).toBe('Network Support');
      expect(prisma.serviceCategory.create).toHaveBeenCalled();
    });

    it('중복된 카테고리명은 에러를 던져야 함', async () => {
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(mockCategory as any);

      await expect(
        service.create({
          categoryName: 'Network Support',
          slaHours: 24,
          priority: 'MEDIUM',
        })
      ).rejects.toThrow('이미 존재하는');
    });
  });

  describe('update', () => {
    it('서비스 카테고리를 수정해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(mockCategory as any);
      vi.mocked(prisma.serviceCategory.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({
        ...mockCategory,
        slaHours: 48,
      } as any);

      const result = await service.update('cat-1', { slaHours: 48 });

      expect(result.slaHours).toBe(48);
      expect(prisma.serviceCategory.update).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('연결된 SR이 없으면 카테고리를 삭제해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        ...mockCategory,
        _count: { srs: 0 },
      } as any);
      vi.mocked(prisma.serviceCategory.delete).mockResolvedValue(mockCategory as any);

      await service.delete('cat-1');

      expect(prisma.serviceCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    });

    it('연결된 SR이 있으면 에러를 던져야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        ...mockCategory,
        _count: { srs: 5 },
      } as any);

      await expect(service.delete('cat-1')).rejects.toThrow('SR이 연결');
    });
  });

  describe('activate/deactivate', () => {
    it('카테고리를 활성화해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(mockCategory as any);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({
        ...mockCategory,
        isActive: true,
      } as any);

      const result = await service.activate('cat-1');

      expect(result.isActive).toBe(true);
    });

    it('카테고리를 비활성화해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(mockCategory as any);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue({
        ...mockCategory,
        isActive: false,
      } as any);

      const result = await service.deactivate('cat-1');

      expect(result.isActive).toBe(false);
    });
  });

  describe('담당자 관리', () => {
    it('담당자를 배정해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(mockCategory as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', name: 'User 1' } as any);
      vi.mocked(prisma.serviceCategory.update).mockResolvedValue(mockCategory as any);

      await service.assignHandler('cat-1', 'user-1');

      expect(prisma.serviceCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { handlerId: 'user-1' } })
      );
    });

    it('존재하지 않는 담당자는 에러를 던져야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue(mockCategory as any);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(service.assignHandler('cat-1', 'non-existent')).rejects.toThrow('담당자');
    });
  });

  describe('SLA 계산', () => {
    it('우선순위별 배율을 반환해야 함', () => {
      expect(service.getSLAMultiplier('CRITICAL')).toBe(0.5);
      expect(service.getSLAMultiplier('HIGH')).toBe(0.75);
      expect(service.getSLAMultiplier('MEDIUM')).toBe(1.0);
      expect(service.getSLAMultiplier('LOW')).toBe(1.5);
    });

    it('기한을 올바르게 계산해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        slaHours: 24,
      } as any);

      const startDate = new Date('2026-01-01T10:00:00Z');
      const dueDate = await service.calculateDueDate('cat-1', 'MEDIUM', startDate);

      // MEDIUM = 1.0 배율, 24시간 후
      expect(dueDate.getTime() - startDate.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('CRITICAL 우선순위는 50% 시간으로 계산해야 함', async () => {
      vi.mocked(prisma.serviceCategory.findUnique).mockResolvedValue({
        slaHours: 24,
      } as any);

      const startDate = new Date('2026-01-01T10:00:00Z');
      const dueDate = await service.calculateDueDate('cat-1', 'CRITICAL', startDate);

      // CRITICAL = 0.5 배율, 12시간 후
      expect(dueDate.getTime() - startDate.getTime()).toBe(12 * 60 * 60 * 1000);
    });

    it('calculateDueDateFromHours는 DB 조회 없이 계산해야 함', () => {
      const startDate = new Date('2026-01-01T10:00:00Z');
      const dueDate = service.calculateDueDateFromHours(24, 'LOW', startDate);

      // LOW = 1.5 배율, 36시간 후
      expect(dueDate.getTime() - startDate.getTime()).toBe(36 * 60 * 60 * 1000);
    });
  });
});
