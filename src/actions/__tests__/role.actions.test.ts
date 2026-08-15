import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateAndAuthorize, validateWithSchema } from '@/lib/action-helpers';
import { PERMISSIONS } from '@/lib/permission-helpers';
import { services } from '@/services/service-registry';

/**
 * 역할 액션은 이제 서비스에 `actor` 를 넘긴다(감사 3.11). 서비스가 불변식을 판정하려면
 * 세션이 필요하므로, 목이 undefined 를 돌려주면 `session.user` 에서 죽는다.
 */
const SESSION = {
  user: {
    id: 'actor-1',
    email: 'actor@example.com',
    name: '행위자',
    image: null,
    roles: ['ADMIN'],
    permissions: [],
    clientIds: [],
  },
};

// Mock dependencies BEFORE importing actions
vi.mock('@/lib/action-helpers', () => ({
  authenticateAndAuthorize: vi.fn(),
  validateWithSchema: vi.fn(),
}));

import {
  createRoleAction,
  deleteRoleAction,
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
    vi.mocked(authenticateAndAuthorize).mockResolvedValue(SESSION as never);
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
      expect(authenticateAndAuthorize).toHaveBeenCalledWith(PERMISSIONS.ROLE.CREATE);
      // 생성 경로도 형제 연산과 똑같이 actor 를 넘겨야 한다. 넘기지 않으면
      // ROLE_CREATE 감사 로그의 userId 가 비어 "누가 만들었나"에 답할 수 없고,
      // 서비스가 정책을 판정할 수도 없다. update/delete 는 감사 3.11 에서 고쳤는데
      // 생성만 빠져 있었다 — 이 단언이 그 재발을 막는다.
      expect(mockRoleService.createRole).toHaveBeenCalledWith(
        { name: 'NEW_ROLE', description: 'desc' },
        SESSION.user.id,
        null,
        SESSION.user
      );
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
      expect(authenticateAndAuthorize).toHaveBeenCalledWith(PERMISSIONS.ROLE.UPDATE);
      expect(mockRoleService.updateRole).toHaveBeenCalledWith(
        'r1',
        { name: 'UPDATED_ROLE', description: 'new desc' },
        SESSION.user.id,
        null,
        SESSION.user
      );
    });
  });

  describe('deleteRoleAction', () => {
    it('성공적으로 역할을 삭제해야 함', async () => {
      mockRoleService.deleteRole.mockResolvedValue(undefined as any);

      const result = await deleteRoleAction('r1');

      expect(result.success).toBe(true);
      expect(authenticateAndAuthorize).toHaveBeenCalledWith(PERMISSIONS.ROLE.DELETE);
      // actor 를 넘겨야 서비스의 불변식이 작동한다(감사 3.11).
      expect(mockRoleService.deleteRole).toHaveBeenCalledWith(
        'r1',
        SESSION.user.id,
        null,
        SESSION.user
      );
    });
  });

  describe('updateRolePermissionsAction', () => {
    it('성공적으로 역할 권한을 업데이트해야 함', async () => {
      mockRoleService.updateRolePermissions.mockResolvedValue(undefined as any);

      const result = await updateRolePermissionsAction('r1', ['p1', 'p2']);

      expect(result.success).toBe(true);
      // 카탈로그에 실재하는 값이어야 한다. 예전 리터럴 'role:update_permissions' 는
      // 대문자 정규화 후 ROLE:UPDATE_PERMISSIONS 가 되는데 그런 행이 없어서,
      // 이 액션은 ADMIN 단락을 뺀 누구도 통과할 수 없는 죽은 통제였다(감사 D-20).
      expect(authenticateAndAuthorize).toHaveBeenCalledWith(PERMISSIONS.ROLE.ASSIGN_PERMISSION);
      expect(mockRoleService.updateRolePermissions).toHaveBeenCalledWith(
        'r1',
        ['p1', 'p2'],
        SESSION.user.id,
        null,
        SESSION.user
      );
    });
  });
});
