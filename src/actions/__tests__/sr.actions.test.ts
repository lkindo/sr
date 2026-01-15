import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSRAction, updateSRAction, deleteSRAction } from '../sr.actions';
import { SRService } from '@/services/sr.service';
import { revalidatePath } from 'next/cache';
import { authenticateAndAuthorize, getAuthenticatedSession, validateWithSchema } from '@/lib/action-helpers';

// Mock dependencies
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/action-helpers', () => ({
  authenticateAndAuthorize: vi.fn(),
  validateWithSchema: vi.fn(),
  getAuthenticatedSession: vi.fn(),
  getFormDataValue: vi.fn(),
}));

vi.mock('../sr-form.utils', () => ({
  buildSRCreateInput: vi.fn((fd) => ({ title: fd.get('title') })),
  buildSRUpdateInput: vi.fn((fd) => ({ title: fd.get('title') })),
}));

vi.mock('@/services/sr.service', () => {
  return {
    SRService: vi.fn().mockImplementation(function () {
      return {
        createSR: vi.fn(),
        updateSR: vi.fn(),
        deleteSR: vi.fn(),
        getSRById: vi.fn(),
        getSRDetailsById: vi.fn(),
      };
    }),
  };
});

describe('SR Server Actions', () => {
  const mockUser = { id: 'user-1', name: 'User' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSRAction', () => {
    it('should call SRService and revalidate on success', async () => {
      const formData = new FormData();
      formData.append('title', 'Valid Title');

      vi.mocked(validateWithSchema).mockReturnValue({ success: true, data: { title: 'Valid Title' } } as any);
      vi.mocked(authenticateAndAuthorize).mockResolvedValue({ user: mockUser } as any);

      const mockCreateSR = vi.fn().mockResolvedValue({ id: 'sr-1' });
      vi.mocked(SRService).mockImplementation(function () {
        return { createSR: mockCreateSR } as any;
      });

      const result = await createSRAction(formData);

      expect(result.success).toBe(true);
      expect(mockCreateSR).toHaveBeenCalledWith({ title: 'Valid Title' }, mockUser);
      expect(revalidatePath).toHaveBeenCalledWith('/srs');
    });

    it('should return error if validation fails', async () => {
      vi.mocked(validateWithSchema).mockReturnValue({ success: false, error: 'Validation Error' } as any);

      const result = await createSRAction(new FormData());

      expect(result.success).toBe(false);
    });
  });

  describe('updateSRAction', () => {
    it('should call SRService and revalidate', async () => {
      const formData = new FormData();
      vi.mocked(validateWithSchema).mockReturnValue({ success: true, data: { title: 'Updated' } } as any);
      vi.mocked(getAuthenticatedSession).mockResolvedValue({ user: mockUser } as any);

      const mockUpdateSR = vi.fn().mockResolvedValue({ id: 'sr-1' });
      vi.mocked(SRService).mockImplementation(function () {
        return { updateSR: mockUpdateSR } as any;
      });

      const result = await updateSRAction('sr-1', formData);

      expect(result.success).toBe(true);
      expect(mockUpdateSR).toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith('/srs');
    });
  });

  describe('deleteSRAction', () => {
    it('successfully deletes and revalidates', async () => {
      vi.mocked(getAuthenticatedSession).mockResolvedValue({ user: mockUser } as any);
      const mockDeleteSR = vi.fn().mockResolvedValue(undefined);
      vi.mocked(SRService).mockImplementation(function () {
        return { deleteSR: mockDeleteSR } as any;
      });

      const result = await deleteSRAction('sr-1');
      expect(result.success).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith('/srs');
    });
  });
});
