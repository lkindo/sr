import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';

import { ServiceCategoryService } from '../service-category.service';

vi.mock('@/lib/prisma', () => ({
  default: {
    serviceCategory: {
      findMany: vi.fn(),
    },
  },
}));

describe('ServiceCategoryService', () => {
  let service: ServiceCategoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ServiceCategoryService();
  });

  describe('getAll', () => {
    it('모든 서비스 카테고리를 반환해야 함', async () => {
      const mockCategories = [
        { id: '1', name: 'Category 1', clientId: 'client1' },
        { id: '2', name: 'Category 2', clientId: 'client1' },
      ];

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
});
