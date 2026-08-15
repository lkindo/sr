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
    it('내부 사용자는 전체 스코프로 조회한다', async () => {
      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-1', roles: ['ADMIN'], permissions: [], clientIds: [] },
      });

      const result = await getServiceCategoriesForSelection('client-1');

      expect(result.success).toBe(true);
      // ADMIN/MANAGER/ENGINEER 는 카테고리 관리 화면이 전체를 필요로 한다.
      expect(serviceCategoryService.getForSelection).toHaveBeenCalledWith('all');
    });

    it('외부 사용자는 지정한 고객사로 스코프해 전달한다', async () => {
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
      expect(serviceCategoryService.getForSelection).toHaveBeenCalledWith({
        clientIds: ['client-1'],
      });
    });

    /**
     * 감사 D-13 회귀 방어 — **이것이 실제 익스플로잇이었다.**
     *
     * 예전에는 `if (clientId)` 로 인가 검사를 감싸고 서비스에도 `undefined` 를 넘겼다.
     * 그래서 유효 세션을 가진 CLIENT_USER 가 이 액션을 **인자 없이** 호출하는 것만으로
     * 전 고객사의 서비스 카탈로그와 SLA 시간을 받아 갔다.
     */
    it('외부 사용자가 인자 없이 불러도 전체가 나오지 않는다', async () => {
      (getAuthenticatedSession as any).mockResolvedValue({
        user: {
          id: 'user-1',
          roles: ['CLIENT_USER'],
          permissions: [],
          clientIds: ['client-1'],
        },
      });

      const result = await getServiceCategoriesForSelection();

      expect(result.success).toBe(true);
      // 'all' 이 넘어가면 이 단언이 깨진다 — 그 순간이 격리가 뚫리는 순간이다.
      expect(serviceCategoryService.getForSelection).toHaveBeenCalledWith({
        clientIds: ['client-1'],
      });
    });

    it('소속 고객사가 없는 외부 사용자는 빈 스코프를 받는다 (fail-closed)', async () => {
      (getAuthenticatedSession as any).mockResolvedValue({
        user: { id: 'user-1', roles: ['CLIENT_USER'], permissions: [], clientIds: [] },
      });

      await getServiceCategoriesForSelection();

      expect(serviceCategoryService.getForSelection).toHaveBeenCalledWith({ clientIds: [] });
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
      expect(serviceCategoryService.getForSelection).toHaveBeenCalledWith({
        clientIds: ['client-1'],
      });
    });
  });
});
