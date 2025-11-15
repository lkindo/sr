import { RoleRepository } from "@/repositories/role.repository";
import { z } from "zod";
import { roleCreateSchema, roleUpdateSchema } from "@/lib/schemas";
import { NotFoundError, ReferentialIntegrityError } from "@/lib/errors";
import { invalidateCache, invalidateCachePattern } from "@/lib/redis-cache";
import type { Role, Permission } from "@prisma/client";

type RoleCreateData = z.infer<typeof roleCreateSchema>;
type RoleUpdateData = z.infer<typeof roleUpdateSchema>;

export class RoleService {
  constructor(
    private roleRepository: RoleRepository = new RoleRepository()
  ) {}

  async getRoleById(id: string): Promise<Role | null> {
    return this.roleRepository.findById(id);
  }

  async getAllRoles(): Promise<(Role & {
    permissions: Array<{
      permission: Permission;
    }>;
    _count: {
      users: number;
    };
  })[]> {
    return this.roleRepository.findAll();
  }

  async createRole(data: RoleCreateData): Promise<Role> {
    const validated = roleCreateSchema.parse(data);
    return this.roleRepository.create(validated);
  }

  async updateRole(id: string, data: RoleUpdateData): Promise<Role> {
    const validated = roleUpdateSchema.parse(data);
    return this.roleRepository.update(id, validated);
  }

  async deleteRole(id: string): Promise<Role> {
    // 역할 삭제 전 관련 데이터 확인
    const role = await this.roleRepository.findById(id);
    if (!role) {
      throw new NotFoundError("역할", id);
    }

    // 참조 무결성 확인: 관련된 데이터가 있는지 체크
    const relatedCounts = await this.roleRepository.getRelatedDataCounts(id);

    if (relatedCounts.usersCount > 0) {
      throw new ReferentialIntegrityError(
        `역할을 삭제할 수 없습니다. ${relatedCounts.usersCount}명의 사용자가 이 역할을 사용 중입니다. ` +
        `먼저 사용자의 역할을 변경한 후 삭제하세요.`
      );
    }

    // 권한은 자동으로 삭제됨 (ON DELETE CASCADE)
    // 하지만 사용자에게 알리기 위해 메시지에 포함
    if (relatedCounts.permissionsCount > 0) {
      // 권한은 있지만 사용자가 없으면 삭제 가능 (권한은 cascade로 자동 삭제됨)
      const { logger } = await import("@/lib/logger");
      logger.info(`역할 삭제 시 ${relatedCounts.permissionsCount}개의 권한 연결이 함께 삭제됩니다.`, {
        roleId: id,
        permissionsCount: relatedCounts.permissionsCount,
      });
    }

    // 관련 사용자가 없으면 삭제 진행 (권한은 자동 삭제됨)
    return this.roleRepository.delete(id);
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<Role | null> {
    // Repository의 트랜잭션 메서드 사용
    await this.roleRepository.updateRolePermissions(roleId, permissionIds);

    // 캐시 무효화 (역할 권한 변경 시 모든 사용자 권한 캐시 무효화)
    await invalidateCachePattern("user:permissions:*");
    await invalidateCachePattern("user:roles:*");
    await invalidateCachePattern("user:full:*");
    await invalidateCachePattern("role:list*");

    // 업데이트된 역할 정보 반환
    return this.getRoleById(roleId);
  }
}
