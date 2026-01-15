import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoleService } from '../role.service';
import { NotFoundError, ReferentialIntegrityError } from '@/lib/errors';
import prisma from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  default: {
    role: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    userRole: {
      count: vi.fn(),
    },
    rolePermission: {
      count: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

describe('RoleService', () => {
  let roleService: RoleService;

  beforeEach(() => {
    vi.clearAllMocks();
    roleService = new RoleService();
  });

  describe('createRole', () => {
    const validRoleData = {
      name: 'Test Role',
      description: 'Test role description',
    };

    it('성공적으로 역할을 생성해야 함', async () => {
      const expectedRole = {
        id: '1',
        ...validRoleData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.role.create).mockResolvedValue(expectedRole as any);

      const result = await roleService.createRole(validRoleData);

      expect(result).toEqual(expectedRole);
      expect(prisma.role.create).toHaveBeenCalledWith({ data: validRoleData });
    });
  });

  describe('updateRole', () => {
    const updateData = {
      name: 'Updated Role',
      description: 'Updated description',
    };

    it('성공적으로 역할을 수정해야 함', async () => {
      const updatedRole = {
        id: '1',
        ...updateData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.role.update).mockResolvedValue(updatedRole as any);

      const result = await roleService.updateRole('1', updateData);

      expect(result).toEqual(updatedRole);
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: updateData,
      });
    });
  });

  describe('deleteRole', () => {
    it('관련 데이터가 없으면 성공적으로 삭제해야 함', async () => {
      const role = { id: '1', name: 'Test Role' };

      vi.mocked(prisma.role.findUnique).mockResolvedValue(role as any);
      vi.mocked(prisma.userRole.count).mockResolvedValue(0);
      vi.mocked(prisma.rolePermission.count).mockResolvedValue(0);
      vi.mocked(prisma.role.delete).mockResolvedValue(role as any);

      const result = await roleService.deleteRole('1');

      expect(result).toEqual(role);
      expect(prisma.role.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('존재하지 않는 역할을 삭제하려하면 NotFoundError를 던져야 함', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue(null);

      await expect(roleService.deleteRole('999')).rejects.toThrow(NotFoundError);
    });

    it('관련 사용자가 있으면 ReferentialIntegrityError를 던져야 함', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue({ id: '1' } as any);
      vi.mocked(prisma.userRole.count).mockResolvedValue(5);

      await expect(roleService.deleteRole('1')).rejects.toThrow(ReferentialIntegrityError);
    });
  });

  describe('updateRolePermissions', () => {
    it('성공적으로 역할 권한을 업데이트해야 함', async () => {
      const permissionIds = ['perm1', 'perm2'];
      const updatedRole = { id: '1', name: 'Test Role' };

      vi.mocked(prisma.role.findUnique).mockResolvedValue(updatedRole as any);
      vi.mocked(prisma.rolePermission.deleteMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.rolePermission.createMany).mockResolvedValue({ count: 2 });

      const result = await roleService.updateRolePermissions('1', permissionIds);

      expect(result).toEqual(updatedRole);
      expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: '1' } });
      expect(prisma.rolePermission.createMany).toHaveBeenCalled();
    });
  });
});
