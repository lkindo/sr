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
  });
});
