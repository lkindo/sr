import { RoleRepository } from "@/repositories/role.repository";
import { z } from "zod";
import { roleCreateSchema, roleUpdateSchema } from "@/lib/schemas";
import prisma from "@/lib/prisma";

type RoleCreateData = z.infer<typeof roleCreateSchema>;
type RoleUpdateData = z.infer<typeof roleUpdateSchema>;

export class RoleService {
  private roleRepository: RoleRepository;

  constructor() {
    this.roleRepository = new RoleRepository();
  }

  async getRoleById(id: string) {
    return this.roleRepository.findById(id);
  }

  async getAllRoles() {
    return this.roleRepository.findAll();
  }

  async createRole(data: RoleCreateData) {
    const validated = roleCreateSchema.parse(data);
    return this.roleRepository.create(validated);
  }

  async updateRole(id: string, data: RoleUpdateData) {
    const validated = roleUpdateSchema.parse(data);
    return this.roleRepository.update(id, validated);
  }

  async deleteRole(id: string) {
    // TODO: 역할 삭제 전 관련 사용자/권한 확인 로직 추가
    return this.roleRepository.delete(id);
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]) {
    // 기존 권한 연결 모두 삭제
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: roleId,
      },
    });

    // 새 권한 연결 생성
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map(pId => ({
          roleId: roleId,
          permissionId: pId,
        })),
      });
    }

    // 업데이트된 역할 정보 반환
    return this.getRoleById(roleId);
  }
}
