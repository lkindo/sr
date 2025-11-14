import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoleService } from '../role.service';
import { NotFoundError, ReferentialIntegrityError } from '@/lib/errors';
import { Role } from '@prisma/client';

// Mock modules - factory 함수 내부에서 mock 생성
vi.mock('@/repositories/role.repository', () => {
  const mockFindById = vi.fn();
  const mockFindAll = vi.fn();
  const mockCreate = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockGetRelatedDataCounts = vi.fn();
  const mockUpdateRolePermissions = vi.fn();

  class MockRoleRepository {
    findById = mockFindById;
    findAll = mockFindAll;
    create = mockCreate;
    update = mockUpdate;
    delete = mockDelete;
    getRelatedDataCounts = mockGetRelatedDataCounts;
    updateRolePermissions = mockUpdateRolePermissions;
  }

  return {
    RoleRepository: MockRoleRepository,
  };
});

describe('RoleService', () => {
  let roleService: RoleService;
  let mockRoleRepo: any;

  beforeEach(() => {
    // Mock 함수들 리셋
    vi.clearAllMocks();

    roleService = new RoleService();
    // RoleService의 private repository에 접근
    mockRoleRepo = (roleService as any).roleRepository;
  });

  describe('createRole', () => {
    const validRoleData = {
      name: 'Test Role',
      description: 'Test role description',
    };

    it('성공적으로 역할을 생성해야 함', async () => {
      const expectedRole: Role = {
        id: '1',
        name: validRoleData.name,
        description: validRoleData.description,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRoleRepo.create.mockResolvedValue(expectedRole);

      const result = await roleService.createRole(validRoleData);

      expect(result).toEqual(expectedRole);
      expect(mockRoleRepo.create).toHaveBeenCalledWith(validRoleData);
    });
  });

  describe('updateRole', () => {
    const updateData = {
      name: 'Updated Role',
      description: 'Updated description',
    };

    it('성공적으로 역할을 수정해야 함', async () => {
      const updatedRole: Role = {
        id: '1',
        name: updateData.name,
        description: updateData.description,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRoleRepo.update.mockResolvedValue(updatedRole);

      const result = await roleService.updateRole('1', updateData);

      expect(result).toEqual(updatedRole);
      expect(mockRoleRepo.update).toHaveBeenCalledWith('1', updateData);
    });
  });

  describe('deleteRole', () => {
    it('관련 데이터가 없으면 성공적으로 삭제해야 함', async () => {
      const role: Role = {
        id: '1',
        name: 'Test Role',
        description: 'Test description',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRoleRepo.findById.mockResolvedValue(role);
      mockRoleRepo.getRelatedDataCounts.mockResolvedValue({
        usersCount: 0,
        permissionsCount: 0,
      });
      mockRoleRepo.delete.mockResolvedValue(role);

      const result = await roleService.deleteRole('1');

      expect(result).toEqual(role);
      expect(mockRoleRepo.getRelatedDataCounts).toHaveBeenCalledWith('1');
      expect(mockRoleRepo.delete).toHaveBeenCalledWith('1');
    });

    it('존재하지 않는 역할을 삭제하려하면 NotFoundError를 던져야 함', async () => {
      mockRoleRepo.findById.mockResolvedValue(null);

      await expect(roleService.deleteRole('999'))
        .rejects
        .toThrow(NotFoundError);

      expect(mockRoleRepo.getRelatedDataCounts).not.toHaveBeenCalled();
      expect(mockRoleRepo.delete).not.toHaveBeenCalled();
    });

    it('관련 사용자가 있으면 ReferentialIntegrityError를 던져야 함', async () => {
      const role: Role = {
        id: '1',
        name: 'Test Role',
        description: 'Test description',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRoleRepo.findById.mockResolvedValue(role);
      mockRoleRepo.getRelatedDataCounts.mockResolvedValue({
        usersCount: 5,  // 사용자 5명이 이 역할 사용 중
        permissionsCount: 3,
      });

      await expect(roleService.deleteRole('1'))
        .rejects
        .toThrow(ReferentialIntegrityError);

      expect(mockRoleRepo.delete).not.toHaveBeenCalled();
    });

    it('권한만 있고 사용자가 없으면 삭제 가능해야 함', async () => {
      const role: Role = {
        id: '1',
        name: 'Test Role',
        description: 'Test description',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRoleRepo.findById.mockResolvedValue(role);
      mockRoleRepo.getRelatedDataCounts.mockResolvedValue({
        usersCount: 0,  // 사용자 없음
        permissionsCount: 3,  // 권한은 있지만 CASCADE로 자동 삭제됨
      });
      mockRoleRepo.delete.mockResolvedValue(role);

      const result = await roleService.deleteRole('1');

      expect(result).toEqual(role);
      expect(mockRoleRepo.delete).toHaveBeenCalledWith('1');
    });
  });

  describe('getRoleById', () => {
    it('성공적으로 역할을 조회해야 함', async () => {
      const role: Role = {
        id: '1',
        name: 'Test Role',
        description: 'Test description',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRoleRepo.findById.mockResolvedValue(role);

      const result = await roleService.getRoleById('1');

      expect(result).toEqual(role);
      expect(mockRoleRepo.findById).toHaveBeenCalledWith('1');
    });

    it('존재하지 않는 역할 ID면 null을 반환해야 함', async () => {
      mockRoleRepo.findById.mockResolvedValue(null);

      const result = await roleService.getRoleById('999');

      expect(result).toBeNull();
    });
  });

  describe('getAllRoles', () => {
    it('모든 역할 목록을 반환해야 함', async () => {
      const roles: Role[] = [
        {
          id: '1',
          name: 'Admin',
          description: 'Administrator role',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'User',
          description: 'Regular user role',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRoleRepo.findAll.mockResolvedValue(roles);

      const result = await roleService.getAllRoles();

      expect(result).toEqual(roles);
      expect(result).toHaveLength(2);
    });

    it('역할이 없으면 빈 배열을 반환해야 함', async () => {
      mockRoleRepo.findAll.mockResolvedValue([]);

      const result = await roleService.getAllRoles();

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('updateRolePermissions', () => {
    it('성공적으로 역할 권한을 업데이트해야 함', async () => {
      const permissionIds = ['perm1', 'perm2', 'perm3'];
      const updatedRole: Role = {
        id: '1',
        name: 'Test Role',
        description: 'Test description',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRoleRepo.updateRolePermissions.mockResolvedValue(undefined);
      mockRoleRepo.findById.mockResolvedValue(updatedRole);

      const result = await roleService.updateRolePermissions('1', permissionIds);

      expect(result).toEqual(updatedRole);
      expect(mockRoleRepo.updateRolePermissions).toHaveBeenCalledWith('1', permissionIds);
      expect(mockRoleRepo.findById).toHaveBeenCalledWith('1');
    });
  });
});
