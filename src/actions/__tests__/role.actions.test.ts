import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateAndAuthorize, validateWithSchema } from '@/lib/action-helpers';
import { services } from '@/services/service-registry';

// Mock dependencies BEFORE importing actions
vi.mock('@/lib/action-helpers', () => ({
  authenticateAndAuthorize: vi.fn(),
  validateWithSchema: vi.fn(),
}));

import {
  createRoleAction,
  deleteRoleAction,
  getRoleAction,
  updateRoleAction,
  updateRolePermissionsAction,
} from '../role.actions';

describe('role.actions', () => {
  const mockRoleService = {
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    getRoleById: vi.fn(),
    getAllRoles: vi.fn(),
    updateRolePermissions: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    services.setMockInstance('roleService', mockRoleService);
  });

  describe('createRoleAction', () => {
    it('유효성 검사 실패 시 에러를 반환해야 함', async () => {
      vi.mocked(validateWithSchema).mockReturnValue({
        success: false,
        error: { name: ['역할 이름은 필수입니다.'] } as any,
      });

      const formData = new FormData();
      const result = await createRoleAction(formData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
      expect(mockRoleService.createRole).not.toHaveBeenCalled();
    });

    it('성공적으로 역할을 생성해야 함', async () => {
      const mockRole = { id: 'r1', name: 'NEW_ROLE', description: 'desc' };
      vi.mocked(validateWithSchema).mockReturnValue({
        success: true,
        data: { name: 'NEW_ROLE', description: 'desc' },
      });
      mockRoleService.createRole.mockResolvedValue(mockRole as any);

      const formData = new FormData();
      formData.append('name', 'NEW_ROLE');
      formData.append('description', 'desc');

      const result = await createRoleAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockRole);
      }
      expect(authenticateAndAuthorize).toHaveBeenCalledWith('role:create');
      expect(mockRoleService.createRole).toHaveBeenCalledWith({
        name: 'NEW_ROLE',
        description: 'desc',
      });
    });
  });

  describe('updateRoleAction', () => {
    it('유효성 검사 실패 시 에러를 반환해야 함', async () => {
      vi.mocked(validateWithSchema).mockReturnValue({
        success: false,
        error: { name: ['유효하지 않은 역할 이름입니다.'] } as any,
      });

      const formData = new FormData();
      const result = await updateRoleAction('r1', formData);

      expect(result.success).toBe(false);
      expect(mockRoleService.updateRole).not.toHaveBeenCalled();
    });

    it('성공적으로 역할을 수정해야 함', async () => {
      const mockRole = { id: 'r1', name: 'UPDATED_ROLE', description: 'new desc' };
      vi.mocked(validateWithSchema).mockReturnValue({
        success: true,
        data: { name: 'UPDATED_ROLE', description: 'new desc' },
      });
      mockRoleService.updateRole.mockResolvedValue(mockRole as any);

      const formData = new FormData();
      formData.append('name', 'UPDATED_ROLE');

      const result = await updateRoleAction('r1', formData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockRole);
      }
      expect(authenticateAndAuthorize).toHaveBeenCalledWith('role:update');
      expect(mockRoleService.updateRole).toHaveBeenCalledWith('r1', {
        name: 'UPDATED_ROLE',
        description: 'new desc',
      });
    });
  });

  describe('deleteRoleAction', () => {
    it('성공적으로 역할을 삭제해야 함', async () => {
      mockRoleService.deleteRole.mockResolvedValue(undefined as any);

      const result = await deleteRoleAction('r1');

      expect(result.success).toBe(true);
      expect(authenticateAndAuthorize).toHaveBeenCalledWith('role:delete');
      expect(mockRoleService.deleteRole).toHaveBeenCalledWith('r1');
    });
  });

  describe('getRoleAction', () => {
    it('역할이 존재하지 않을 시 fail 결과를 반환해야 함', async () => {
      mockRoleService.getRoleById.mockResolvedValue(null);

      const result = await getRoleAction('r-none');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('역할을 찾을 수 없습니다.');
      }
    });

    it('역할을 성공적으로 조회해야 함', async () => {
      const mockRole = { id: 'r1', name: 'ADMIN' };
      mockRoleService.getRoleById.mockResolvedValue(mockRole as any);

      const result = await getRoleAction('r1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockRole);
      }
    });
  });

  describe('updateRolePermissionsAction', () => {
    it('성공적으로 역할 권한을 업데이트해야 함', async () => {
      mockRoleService.updateRolePermissions.mockResolvedValue(undefined as any);

      const result = await updateRolePermissionsAction('r1', ['p1', 'p2']);

      expect(result.success).toBe(true);
      expect(authenticateAndAuthorize).toHaveBeenCalledWith('role:update_permissions');
      expect(mockRoleService.updateRolePermissions).toHaveBeenCalledWith('r1', ['p1', 'p2']);
    });
  });
});
