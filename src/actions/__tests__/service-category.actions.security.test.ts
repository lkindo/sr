import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE imports
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn(),
  },
}));

vi.mock('next-auth', () => ({
  default: vi.fn().mockReturnValue({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  }),
}));

// Mock internal modules
vi.mock('@/services/service-category.service', () => {
  const ServiceCategoryService = vi.fn();
  ServiceCategoryService.prototype.getAll = vi.fn();
  ServiceCategoryService.prototype.getForSelection = vi.fn();
  return {
    ServiceCategoryService,
    serviceCategoryService: new ServiceCategoryService(),
  };
});

vi.mock('@/lib/action-helpers');

import { getAuthenticatedSession } from '@/lib/action-helpers';
import { serviceCategoryService } from '@/services/service-category.service';

import { getServiceCategoriesForSelection } from '../service-category.actions';

describe('Service Category Actions Security', () => {
  const mockCategoriesFull = [
    {
      id: 'cat-1',
      categoryName: 'Category 1',
      handler: { email: 'handler@example.com' }, // Sensitive data
    },
  ];

  const mockCategoriesSelection = [
    {
      id: 'cat-1',
      categoryName: 'Category 1',
      // NO handler email here
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock service methods
    (serviceCategoryService.getAll as any).mockResolvedValue(mockCategoriesFull);
    (serviceCategoryService.getForSelection as any).mockResolvedValue(mockCategoriesSelection);
  });

  describe('getServiceCategoriesForSelection', () => {
    it('should REJECT access without authentication', async () => {
      // Mock getAuthenticatedSession to throw (simulating unauthenticated)
      (getAuthenticatedSession as any).mockRejectedValue(new Error('Unauthorized'));

      const result = await getServiceCategoriesForSelection();

      // Expect failure
      expect(result.success).toBe(false);
      expect(getAuthenticatedSession).toHaveBeenCalled();
    });

    it('should ALLOW access if authenticated', async () => {
      // Mock getAuthenticatedSession to succeed
      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-1' },
      });

      const result = await getServiceCategoriesForSelection();

      expect(result.success).toBe(true);
      expect(getAuthenticatedSession).toHaveBeenCalled();
    });

    it('should RETURN only safe fields (using getForSelection)', async () => {
      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-1' },
      });

      const result = await getServiceCategoriesForSelection();

      expect(result.success).toBe(true);
      if (result.success) {
        // Should use getForSelection, not getAll
        expect(serviceCategoryService.getForSelection).toHaveBeenCalled();
        expect(serviceCategoryService.getAll).not.toHaveBeenCalled();

        // Verify data structure
        const firstItem = result.data[0] as any;
        expect(firstItem.id).toBe('cat-1');
        expect(firstItem.categoryName).toBe('Category 1');
        expect(firstItem.handler).toBeUndefined(); // Sensitive data should be gone
      }
    });

    /**
     * 감사 3.19 — 테넌트 스코프.
     *
     * 예전에는 clientId 인자 자체가 없어 항상 전체 카탈로그를 돌려줬다.
     * 이제 clientId 를 받되, 외부 사용자가 임의 clientId 를 넣어 타 테넌트 카탈로그를
     * 열람하지 못하도록 소속을 검증한다.
     */
    it('clientId 를 서비스 계층까지 전달한다', async () => {
      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-1', roles: ['ADMIN'], permissions: [], clientIds: [] },
      });

      const result = await getServiceCategoriesForSelection('client-1');

      expect(result.success).toBe(true);
      expect(serviceCategoryService.getForSelection).toHaveBeenCalledWith('client-1');
    });

    it('소속되지 않은 고객사의 카테고리 조회를 거부한다', async () => {
      // 외부 사용자(CLIENT_ADMIN): 자기 소속은 client-1 뿐이다.
      (getAuthenticatedSession as any).mockResolvedValue({
        user: {
          id: 'user-1',
          roles: ['CLIENT_ADMIN'],
          permissions: ['CLIENT:READ'],
          clientIds: ['client-1'],
        },
      });

      const result = await getServiceCategoriesForSelection('other-client');

      expect(result.success).toBe(false);
      expect(serviceCategoryService.getForSelection).not.toHaveBeenCalled();
    });

    it('자기 소속 고객사는 허용한다', async () => {
      (getAuthenticatedSession as any).mockResolvedValue({
        user: {
          id: 'user-1',
          roles: ['CLIENT_ADMIN'],
          permissions: ['CLIENT:READ'],
          clientIds: ['client-1'],
        },
      });

      const result = await getServiceCategoriesForSelection('client-1');

      expect(result.success).toBe(true);
      expect(serviceCategoryService.getForSelection).toHaveBeenCalledWith('client-1');
    });
  });
});
