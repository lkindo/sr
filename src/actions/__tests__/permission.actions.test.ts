import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateAndAuthorize } from '@/lib/action-helpers';
import { services } from '@/services/service-registry';

vi.mock('@/lib/action-helpers', () => ({
  authenticateAndAuthorize: vi.fn(),
}));

import { getAllPermissionsAction } from '../permission.actions';

describe('permission.actions', () => {
  const mockGetAllPermissions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    services.setMockInstance('permissionService', {
      getAllPermissions: mockGetAllPermissions,
    });
  });

  describe('getAllPermissionsAction', () => {
    it('성공적으로 모든 권한 목록을 조회해야 함', async () => {
      const mockPermissions = [
        { id: 'p1', resource: 'users', action: 'read', description: 'Read users' },
        { id: 'p2', resource: 'users', action: 'write', description: 'Write users' },
      ];
      mockGetAllPermissions.mockResolvedValue(mockPermissions);

      const result = await getAllPermissionsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockPermissions);
      }
      expect(authenticateAndAuthorize).toHaveBeenCalledWith('ROLE:READ');
      expect(mockGetAllPermissions).toHaveBeenCalled();
    });

    it('에러 발생 시 errorToResult가 올바른 실패 결과를 반환해야 함', async () => {
      vi.mocked(authenticateAndAuthorize).mockRejectedValue(new Error('인증 실패'));

      const result = await getAllPermissionsAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('인증 실패');
      }
    });
  });
});
