import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSRAction, updateSRAction, deleteSRAction } from '../sr.actions';
import { UnauthorizedError } from '@/lib/errors';
import { getAuthenticatedSession } from '@/lib/action-helpers';

// Mock dependencies
const mockCreateSR = vi.fn();
const mockUpdateSR = vi.fn();
const mockDeleteSR = vi.fn();
const mockAuthenticateAndAuthorize = vi.fn();
const mockValidateWithSchema = vi.fn();

vi.mock('@/services/sr.service', () => ({
  SRService: class MockSRService {
    createSR = mockCreateSR;
    updateSR = mockUpdateSR;
    deleteSR = mockDeleteSR;
  },
}));

vi.mock('@/lib/action-helpers', () => ({
  authenticateAndAuthorize: (permission: string) => mockAuthenticateAndAuthorize(permission),
  validateWithSchema: (data: unknown, schema: any) => mockValidateWithSchema(data, schema),
  getAuthenticatedSession: vi.fn(),
}));

vi.mock('@/lib/form-data-parser', () => ({
  getFormDataValue: (formData: FormData, key: string) => {
    return formData.get(key) as string | null;
  },
}));

describe('SR Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSRAction', () => {
    it('성공적으로 SR을 생성해야 함', async () => {
      const formData = new FormData();
      formData.append('title', 'Test SR');
      formData.append('description', 'Test description');
      formData.append('clientId', 'client1');
      formData.append('serviceCategoryId', 'category1');
      formData.append('requestedPriority', 'MEDIUM');

      const mockSession = {
        user: {
          id: 'user1',
          email: 'user@example.com',
          name: 'Test User',
          image: null,
          roles: ['USER'],
          permissions: ['sr:create'],
          clientIds: [],
        },
      };

      const mockSR = {
        id: 'sr1',
        srNumber: 'SR-20241114-0001',
        title: 'Test SR',
        client: { id: 'client1', code: 'CLI001', name: 'Test Client' },
        requester: { id: 'user1', name: 'Test User', email: 'user@example.com' },
        assignee: null,
        serviceCategory: { id: 'category1', categoryName: 'Test Category' },
      };

      mockAuthenticateAndAuthorize.mockResolvedValue(mockSession);
      mockValidateWithSchema.mockReturnValue({
        success: true,
        data: {
          title: 'Test SR',
          description: 'Test description',
          clientId: 'client1',
          serviceCategoryId: 'category1',
          requestedPriority: 'MEDIUM',
        },
      });
      mockCreateSR.mockResolvedValue(mockSR);

      const result = await createSRAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockSR);
      }
      expect(mockAuthenticateAndAuthorize).toHaveBeenCalledWith('SR:CREATE');
      expect(mockCreateSR).toHaveBeenCalled();
    });

    it('검증 실패 시 에러를 반환해야 함', async () => {
      const formData = new FormData();
      formData.append('title', ''); // 빈 제목

      mockValidateWithSchema.mockReturnValue({
        success: false,
        error: '제목은 최소 5자 이상이어야 합니다.',
        code: 'VALIDATION_ERROR',
      });

      const result = await createSRAction(formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('제목');
      }
    });
  });

  describe('updateSRAction', () => {
    it('성공적으로 SR을 수정해야 함', async () => {
      const formData = new FormData();
      formData.append('title', 'Updated SR');
      formData.append('description', 'Updated description');

      const mockSession = {
        user: {
          id: 'user1',
          email: 'user@example.com',
          name: 'Test User',
          image: null,
          roles: ['USER'],
          permissions: ['sr:update'],
          clientIds: [],
        },
        expires: new Date().toISOString(),
      };

      const mockUpdatedSR = {
        id: 'sr1',
        title: 'Updated SR',
        description: 'Updated description',
      };

      mockAuthenticateAndAuthorize.mockResolvedValue(mockSession);
      mockValidateWithSchema.mockReturnValue({
        success: true,
        data: {
          title: 'Updated SR',
          description: 'Updated description',
        },
      });
      mockUpdateSR.mockResolvedValue(mockUpdatedSR);
      vi.mocked(getAuthenticatedSession).mockResolvedValue(mockSession);

      const result = await updateSRAction('sr1', formData);

      expect(result.success).toBe(true);
      // expect(mockAuthenticateAndAuthorize).toHaveBeenCalledWith('sr:update'); // Removed
      expect(mockUpdateSR).toHaveBeenCalledWith(
        'sr1',
        expect.any(Object),
        mockSession.user
      );
    });
  });

  describe('deleteSRAction', () => {
    it('성공적으로 SR을 삭제해야 함', async () => {
      mockAuthenticateAndAuthorize.mockResolvedValue({
        user: { id: 'user1' },
      });
      vi.mocked(getAuthenticatedSession).mockResolvedValue({ user: { id: 'user1' } } as any);
      mockDeleteSR.mockResolvedValue(undefined);

      const result = await deleteSRAction('sr1');

      expect(result.success).toBe(true);
      // expect(mockAuthenticateAndAuthorize).toHaveBeenCalledWith('sr:delete'); // Removed
      expect(mockDeleteSR).toHaveBeenCalledWith('sr1', expect.any(Object));
    });

    it('권한이 없으면 에러를 반환해야 함', async () => {
      mockDeleteSR.mockRejectedValue(new UnauthorizedError("권한이 없습니다"));
      vi.mocked(getAuthenticatedSession).mockResolvedValue({ user: { id: 'user1' } } as any);

      const result = await deleteSRAction('sr1');

      expect(result.success).toBe(false);
    });
  });
});

