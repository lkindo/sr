import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SRService } from '@/services/sr.service';

import {
  createSRAction,
  deleteSRAction,
  getSRAction,
  getSRActivitiesAction,
  getSRCommentsAction,
  getSRDetailsAction,
  updateSRAction,
} from '../sr.actions';

// Mock dependencies
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock auth
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// Mock Permission Service
const { mockRequirePermission } = vi.hoisted(() => ({
  mockRequirePermission: vi.fn(),
}));

vi.mock('@/services/permission.service', () => ({
  PermissionService: class {
    requirePermission = mockRequirePermission;
  },
}));

// Mock Prisma
const mockPrisma = {
  sRActivity: { findMany: vi.fn() },
  sRComment: { findMany: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
}));

// Mock SRService
const { mockSRService } = vi.hoisted(() => ({
  mockSRService: {
    createSR: vi.fn(),
    updateSR: vi.fn(),
    deleteSR: vi.fn(),
    getSRById: vi.fn(),
    getSRDetailsById: vi.fn(),
  },
}));

vi.mock('@/services/sr.service', () => ({
  SRService: vi.fn(),
  srService: mockSRService,
}));

// Import auth to setup mocks
import { auth } from '@/auth';

describe('SR Server Actions', () => {
  const mockUser = { id: 'user-1', name: 'User', roles: ['ADMIN'], permissions: [], clientIds: [] };
  const mockSession = { user: mockUser, expires: '2099-01-01' };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup generic mock implementations
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    mockRequirePermission.mockResolvedValue(undefined); // Permission granted by default
  });

  describe('createSRAction', () => {
    const validFormData = new FormData();
    validFormData.append('title', 'Valid Title');
    validFormData.append('description', 'Valid Description that is long enough');
    validFormData.append('clientId', 'client-1');
    validFormData.append('serviceCategoryId', 'cat-1');
    validFormData.append('requestedPriority', 'MEDIUM');

    it('should call SRService and revalidate on success', async () => {
      mockSRService.createSR.mockResolvedValue({ id: 'sr-1' });

      const result = await createSRAction(validFormData);

      if (!result.success) {
        console.error('createSRAction error:', result);
      }
      expect(result.success).toBe(true);
      expect(mockSRService.createSR).toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith('/srs');
    });

    it('should return error if validation fails', async () => {
      const invalidFormData = new FormData();
      // Missing required fields

      const result = await createSRAction(invalidFormData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return error if authentication fails', async () => {
      vi.mocked(auth).mockResolvedValue(null as any);

      const result = await createSRAction(validFormData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('UNAUTHORIZED');
      }
    });

    it('should handle service errors', async () => {
      mockSRService.createSR.mockRejectedValue(new Error('Service Error'));

      const result = await createSRAction(validFormData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Service Error');
      }
    });
  });

  describe('updateSRAction', () => {
    it('should call SRService and revalidate', async () => {
      const formData = new FormData();
      formData.append('title', 'Updated Title'); // Min 5 chars
      formData.append('description', 'Updated Description that is long enough');
      formData.append('clientId', 'client-1');
      formData.append('serviceCategoryId', 'cat-1');
      formData.append('requestedPriority', 'MEDIUM');

      mockSRService.updateSR.mockResolvedValue({ id: 'sr-1' });

      const result = await updateSRAction('sr-1', formData);

      if (!result.success) {
        console.error('updateSRAction error:', result);
      }
      expect(result.success).toBe(true);
      expect(mockSRService.updateSR).toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith('/srs');
      expect(revalidatePath).toHaveBeenCalledWith('/srs/sr-1');
    });

    it('should return error if session invalid', async () => {
      vi.mocked(auth).mockResolvedValue(null as any);
      const result = await updateSRAction('id', new FormData());
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('UNAUTHORIZED');
    });
  });

  describe('deleteSRAction', () => {
    it('successfully deletes and revalidates', async () => {
      mockSRService.deleteSR.mockResolvedValue(undefined);

      const result = await deleteSRAction('sr-1');
      expect(result.success).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith('/srs');
    });

    it('handles errors', async () => {
      mockSRService.deleteSR.mockRejectedValue(new Error('Delete Failed'));

      const result = await deleteSRAction('sr-1');
      expect(result.success).toBe(false);
    });
  });

  describe('getSRAction', () => {
    it('returns SR when found', async () => {
      mockSRService.getSRById.mockResolvedValue({ id: 'sr-1', title: 'SR' });
      const result = await getSRAction('sr-1');
      expect(result.success).toBe(true);
    });

    it('returns failure when not found', async () => {
      mockSRService.getSRById.mockResolvedValue(null);
      const result = await getSRAction('sr-999');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('getSRDetailsAction', () => {
    it('returns SR details when found', async () => {
      mockSRService.getSRDetailsById.mockResolvedValue({ id: 'sr-1', title: 'SR Details' });
      const result = await getSRDetailsAction('sr-1');
      expect(result.success).toBe(true);
    });

    it('returns failure when not found', async () => {
      mockSRService.getSRDetailsById.mockResolvedValue(null);
      const result = await getSRDetailsAction('sr-999');
      expect(result.success).toBe(false);
    });
  });

  describe('getSRActivitiesAction', () => {
    it('returns activities', async () => {
      const mockActivities = [{ id: 'act-1' }];
      mockPrisma.sRActivity.findMany.mockResolvedValue(mockActivities);

      const result = await getSRActivitiesAction('sr-1', { limit: 10 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activities).toHaveLength(1);
      }
    });
  });

  describe('getSRCommentsAction', () => {
    it('returns comments', async () => {
      const mockComments = [{ id: 'c1' }];
      mockPrisma.sRComment.findMany.mockResolvedValue(mockComments);

      const result = await getSRCommentsAction('sr-1', { limit: 10 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.comments).toHaveLength(1);
      }
    });
  });
});
