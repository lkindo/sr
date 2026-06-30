import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError, ReferentialIntegrityError } from '@/lib/errors';
import prisma from '@/lib/prisma';

import { RoleService } from '../role.service';

vi.mock('@/lib/prisma', () => {
  const mockPrisma: any = {
    auditLog: {
      create: vi.fn(),
    },
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
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    permission: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn((cb: any) => cb(mockPrisma)),
  };
  return { default: mockPrisma };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logError: vi.fn(),
  },
}));

const sampleRole = {
  id: 'role-1',
  name: 'ADMIN',
  description: 'Administrator',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
};

describe('RoleService coverage', () => {
  let service: RoleService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RoleService();
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(prisma));
  });

  describe('getRoleById', () => {
    it('returns the role found by id', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue(sampleRole as any);

      const result = await service.getRoleById('role-1');

      expect(result).toEqual(sampleRole);
      expect(prisma.role.findUnique).toHaveBeenCalledWith({ where: { id: 'role-1' } });
    });

    it('returns null when not found', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue(null);

      const result = await service.getRoleById('missing');

      expect(result).toBeNull();
    });
  });

  describe('getAllRoles', () => {
    it('returns roles with permissions and counts included', async () => {
      const rows = [
        { ...sampleRole, permissions: [{ permission: { id: 'p1' } }], _count: { users: 3 } },
      ];
      vi.mocked(prisma.role.findMany).mockResolvedValue(rows as any);

      const result = await service.getAllRoles();

      expect(result).toEqual(rows);
      expect(prisma.role.findMany).toHaveBeenCalledWith({
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { users: true } },
        },
      });
    });
  });

  describe('createRole', () => {
    it('creates a role and writes an audit log', async () => {
      vi.mocked(prisma.role.create).mockResolvedValue(sampleRole as any);

      const result = await service.createRole(
        { name: 'ADMIN', description: 'Administrator' },
        'actor-1',
        '10.0.0.1'
      );

      expect(result).toEqual(sampleRole);
      expect(prisma.role.create).toHaveBeenCalledWith({
        data: { name: 'ADMIN', description: 'Administrator' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'actor-1',
            actionType: 'ROLE_CREATE',
            targetEntity: 'Role',
            targetId: 'role-1',
            ipAddress: '10.0.0.1',
          }),
        })
      );
    });

    it('throws on invalid input and never touches the database', async () => {
      await expect(service.createRole({ name: '' } as any)).rejects.toThrow();
      expect(prisma.role.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('updates an existing role and audits the change', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue(sampleRole as any);
      const updated = { ...sampleRole, name: 'SUPERADMIN' };
      vi.mocked(prisma.role.update).mockResolvedValue(updated as any);

      const result = await service.updateRole(
        'role-1',
        { name: 'SUPERADMIN' },
        'actor-2',
        '10.0.0.2'
      );

      expect(result).toEqual(updated);
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 'role-1' },
        data: { name: 'SUPERADMIN' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'ROLE_UPDATE',
            targetId: 'role-1',
          }),
        })
      );
    });

    it('throws an invalid-input error before any lookup', async () => {
      // name explicitly null fails schema (partial allows omission, not null)
      await expect(service.updateRole('role-1', { name: 123 } as any)).rejects.toThrow();
      expect(prisma.role.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteRole', () => {
    it('deletes a role with no references and audits it', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue(sampleRole as any);
      vi.mocked(prisma.userRole.count).mockResolvedValue(0);
      vi.mocked(prisma.rolePermission.count).mockResolvedValue(0);
      vi.mocked(prisma.role.delete).mockResolvedValue(sampleRole as any);

      const result = await service.deleteRole('role-1', 'actor-3', '10.0.0.3');

      expect(result).toEqual(sampleRole);
      expect(prisma.role.delete).toHaveBeenCalledWith({ where: { id: 'role-1' } });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actionType: 'ROLE_DELETE', targetId: 'role-1' }),
        })
      );
    });

    it('logs but still deletes when only permission references exist', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue(sampleRole as any);
      vi.mocked(prisma.userRole.count).mockResolvedValue(0);
      vi.mocked(prisma.rolePermission.count).mockResolvedValue(2);
      vi.mocked(prisma.role.delete).mockResolvedValue(sampleRole as any);

      const result = await service.deleteRole('role-1');

      expect(result).toEqual(sampleRole);
      expect(prisma.role.delete).toHaveBeenCalled();
    });

    it('throws NotFoundError when the role does not exist', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue(null);

      await expect(service.deleteRole('missing')).rejects.toBeInstanceOf(NotFoundError);
      expect(prisma.role.delete).not.toHaveBeenCalled();
    });

    it('throws ReferentialIntegrityError when users still use the role', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue(sampleRole as any);
      vi.mocked(prisma.userRole.count).mockResolvedValue(5);
      vi.mocked(prisma.rolePermission.count).mockResolvedValue(0);

      await expect(service.deleteRole('role-1')).rejects.toBeInstanceOf(ReferentialIntegrityError);
      expect(prisma.role.delete).not.toHaveBeenCalled();
    });
  });

  describe('updateRolePermissions', () => {
    it('replaces permission mappings and returns the refreshed role', async () => {
      vi.mocked(prisma.role.findUnique)
        .mockResolvedValueOnce(sampleRole as any) // initial existence check
        .mockResolvedValueOnce(sampleRole as any); // getRoleById at the end
      vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([
        { permissionId: 'old-1' },
      ] as any);
      vi.mocked(prisma.rolePermission.deleteMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(prisma.rolePermission.createMany).mockResolvedValue({ count: 2 } as any);

      const result = await service.updateRolePermissions(
        'role-1',
        ['p1', 'p2'],
        'actor-4',
        '10.0.0.4'
      );

      expect(result).toEqual(sampleRole);
      expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
      });
      expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: 'role-1', permissionId: 'p1' },
          { roleId: 'role-1', permissionId: 'p2' },
        ],
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: 'ROLE_PERMISSIONS_UPDATE',
            targetId: 'role-1',
            changes: { before: ['old-1'], after: ['p1', 'p2'] },
          }),
        })
      );
    });

    it('clears mappings without creating when no permissions given', async () => {
      vi.mocked(prisma.role.findUnique)
        .mockResolvedValueOnce(sampleRole as any)
        .mockResolvedValueOnce(sampleRole as any);
      vi.mocked(prisma.rolePermission.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.rolePermission.deleteMany).mockResolvedValue({ count: 0 } as any);

      const result = await service.updateRolePermissions('role-1', []);

      expect(result).toEqual(sampleRole);
      expect(prisma.rolePermission.deleteMany).toHaveBeenCalled();
      expect(prisma.rolePermission.createMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the role does not exist', async () => {
      vi.mocked(prisma.role.findUnique).mockResolvedValue(null);

      await expect(service.updateRolePermissions('missing', ['p1'])).rejects.toBeInstanceOf(
        NotFoundError
      );
      expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
    });
  });
});
