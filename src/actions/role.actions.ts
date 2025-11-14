"use server";

import { z } from "zod";
import { RoleService } from "@/services/role.service";
import { auth } from "@/auth";
import { PermissionService } from "@/services/permission.service";
import { roleCreateSchema, roleUpdateSchema } from "@/lib/schemas";

const permissionService = new PermissionService();

export async function createRoleAction(formData: FormData) {
  try {
    const data = {
      name: formData.get("name") as string,
      description: formData.get("description") as string | undefined,
    };

    const validated = roleCreateSchema.parse(data);

    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "인증되지 않은 사용자입니다." };
    }
    await permissionService.requirePermission(session.user.id, 'role:create');

    const roleService = new RoleService();
    const role = await roleService.createRole(validated);

    return { success: true, data: role, message: "역할이 성공적으로 생성되었습니다." };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues?.[0].message || "입력값 검증에 실패했습니다." };
    }
    return { success: false, error: error instanceof Error ? error.message : "역할 생성 중 오류가 발생했습니다." };
  }
}

export async function updateRoleAction(id: string, formData: FormData) {
  try {
    const data = {
      name: formData.get("name") as string | undefined,
      description: formData.get("description") as string | undefined,
    };

    const validated = roleUpdateSchema.parse(data);

    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "인증되지 않은 사용자입니다." };
    }
    await permissionService.requirePermission(session.user.id, 'role:update');

    const roleService = new RoleService();
    const role = await roleService.updateRole(id, validated);

    return { success: true, data: role, message: "역할이 성공적으로 업데이트되었습니다." };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues?.[0].message || "입력값 검증에 실패했습니다." };
    }
    return { success: false, error: error instanceof Error ? error.message : "역할 업데이트 중 오류가 발생했습니다." };
  }
}

export async function deleteRoleAction(id: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "인증되지 않은 사용자입니다." };
    }
    await permissionService.requirePermission(session.user.id, 'role:delete');

    const roleService = new RoleService();
    await roleService.deleteRole(id);

    return { success: true, message: "역할이 성공적으로 삭제되었습니다." };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "역할 삭제 중 오류가 발생했습니다." };
  }
}

export async function getRoleAction(id: string) {
  try {
    const roleService = new RoleService();
    const role = await roleService.getRoleById(id);
    if (!role) {
      return { success: false, error: "역할을 찾을 수 없습니다." };
    }
    return { success: true, data: role };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "역할 조회 중 오류가 발생했습니다." };
  }
}

export async function getAllRolesAction() {
  try {
    const roleService = new RoleService();
    const roles = await roleService.getAllRoles();
    return { success: true, data: roles };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "역할 목록 조회 중 오류가 발생했습니다." };
  }
}

export async function updateRolePermissionsAction(roleId: string, permissionIds: string[]) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "인증되지 않은 사용자입니다." };
    }
    await permissionService.requirePermission(session.user.id, 'role:update_permissions'); // Assuming a specific permission for this

    const roleService = new RoleService();
    await roleService.updateRolePermissions(roleId, permissionIds);

    return { success: true, message: "역할 권한이 성공적으로 업데이트되었습니다." };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "역할 권한 업데이트 중 오류가 발생했습니다." };
  }
}

