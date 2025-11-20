import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetAll, ServiceCategoryServiceMock } = vi.hoisted(() => {
    const mockGetAll = vi.fn();
    class ServiceCategoryServiceMock {
        getAll = mockGetAll;
    }
    return { mockGetAll, ServiceCategoryServiceMock };
});

vi.mock('@/services/service-category.service', () => ({
    ServiceCategoryService: ServiceCategoryServiceMock,
}));

// Mock auth-wrapper
vi.mock('@/lib/auth-wrapper', () => ({
    withAuth: (handler: any) => handler,
}));

import { GET } from '../route';

describe('GET /api/service-categories', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('모든 서비스 카테고리를 반환해야 함', async () => {
        const mockCategories = [
            { id: '1', name: 'Category 1', clientId: 'client1' },
            { id: '2', name: 'Category 2', clientId: 'client1' },
        ];

        mockGetAll.mockResolvedValue(mockCategories);

        const request = new Request('http://localhost/api/service-categories') as NextRequest;
        const response = await GET(request);
        const json = await response.json();

        expect(json).toEqual(mockCategories);
        expect(mockGetAll).toHaveBeenCalledTimes(1);
    });

    it('빈 배열을 반환할 수 있어야 함', async () => {
        mockGetAll.mockResolvedValue([]);

        const request = new Request('http://localhost/api/service-categories') as NextRequest;
        const response = await GET(request);
        const json = await response.json();

        expect(json).toEqual([]);
        expect(mockGetAll).toHaveBeenCalledTimes(1);
    });

    it('서비스에서 에러가 발생하면 에러를 전파해야 함', async () => {
        mockGetAll.mockRejectedValue(new Error('Database error'));

        const request = new Request('http://localhost/api/service-categories') as NextRequest;

        await expect(GET(request)).rejects.toThrow('Database error');
    });
});
