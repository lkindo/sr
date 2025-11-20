import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceCategoryService } from '../service-category.service';
import { ServiceCategoryRepository } from '@/repositories/service-category.repository';

vi.mock('@/repositories/service-category.repository');

describe('ServiceCategoryService', () => {
    let service: ServiceCategoryService;
    let mockRepository: any;

    beforeEach(() => {
        mockRepository = {
            findAll: vi.fn(),
        };
        service = new ServiceCategoryService(mockRepository);
    });

    describe('getAll', () => {
        it('모든 서비스 카테고리를 반환해야 함', async () => {
            const mockCategories = [
                { id: '1', name: 'Category 1', clientId: 'client1' },
                { id: '2', name: 'Category 2', clientId: 'client1' },
            ];

            mockRepository.findAll.mockResolvedValue(mockCategories);

            const result = await service.getAll();

            expect(result).toEqual(mockCategories);
            expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
        });

        it('빈 배열을 반환할 수 있어야 함', async () => {
            mockRepository.findAll.mockResolvedValue([]);

            const result = await service.getAll();

            expect(result).toEqual([]);
            expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
        });
    });
});
