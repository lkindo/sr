import { z } from "zod";
import { roleCreateSchema, roleUpdateSchema } from "@/lib/schemas";
import { NotFoundError, ReferentialIntegrityError } from "@/lib/errors";
import { invalidateCache, invalidateCachePattern } from "@/lib/redis-cache";
import prisma from "@/lib/prisma";
import type { Role, Permission } from "@prisma/client";

type RoleCreateData = z.infer<typeof roleCreateSchema>;
type RoleUpdateData = z.infer<typeof roleUpdateSchema>;

export class RoleService {
  constructor() { }

  async getRoleById(id: string): Promise<Role | null> {
    return prisma.role.findUnique({ where: { id } });
  }

  async getAllRoles(): Promise<(Role & {
    permissions: Array<{
      permission: Permission;
    }>;
    _count: {
      users: number;
    };
  })[]> {
    return prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    }) as Promise<(Role & { permissions: { permission: Permission }[]; _count: { users: number } })[]>;
  }

  async createRole(data: RoleCreateData): Promise<Role> {
    const validated = roleCreateSchema.parse(data);
    return prisma.role.create({ data: validated });
  }

  async updateRole(id: string, data: RoleUpdateData): Promise<Role> {
    const validated = roleUpdateSchema.parse(data);
    return prisma.role.update({ where: { id }, data: validated });
  }

  async deleteRole(id: string): Promise<Role> {
    // 역할 삭제 전 관련 데이터 확인
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundError("역할", id);
    }

    // 참조 무결성 확인
    const usersCount = await prisma.userRole.count({ where: { roleId: id } });
    const permissionsCount = await prisma.rolePermission.count({ where: { roleId: id } });

    if (usersCount > 0) {
      throw new ReferentialIntegrityError(
        `역할을 삭제할 수 없습니다. ${usersCount}명의 사용자가 이 역할을 사용 중입니다. ` +
        `먼저 사용자의 역할을 변경한 후 삭제하세요.`
      );
    }

    if (permissionsCount > 0) {
      const { logger } = await import("@/lib/logger");
      logger.info(`역할 삭제 시 ${permissionsCount}개의 권한 연결이 함께 삭제됩니다.`, {
        roleId: id,
        permissionsCount,
      });
    }

    return prisma.role.delete({ where: { id } });
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<Role | null> {
    await prisma.$transaction(async (tx) => {
      // 1. 기존 권한 매핑 삭제
      await tx.rolePermission.deleteMany({
        where: { roleId },
      });

      // 2. 새 권한 매핑 생성
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId,
            permissionId,
          })),
        });
      }
    });

    // 캐시 무효화 (역할 권한 변경 시 모든 사용자 권한 캐시 무효화)
    await invalidateCachePattern("user:permissions:*");
    await invalidateCachePattern("user:roles:*");
    await invalidateCachePattern("user:full:*");
    await invalidateCachePattern("role:list*");

    // 업데이트된 역할 정보 반환
    return this.getRoleById(roleId);
  }
}
