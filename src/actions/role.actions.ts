"use server";

import { z } from "zod";
import { RoleService } from "@/services/role.service";
import { auth } from "@/auth";
import { PermissionService } from "@/services/permission.service";
import { roleCreateSchema, roleUpdateSchema } from "@/lib/schemas";
import { Result, ok, fail } from "@/lib/result";
import { errorToResult, UnauthorizedError } from "@/lib/errors";

const permissionService = new PermissionService();

export async function createRoleAction(formData: FormData): Promise<Result<any>> {
  try {
    const data = {
      name: formData.get("name") as string,
      description: formData.get("description") as string | undefined,
    };

    const validated = roleCreateSchema.parse(data);

    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }
    await permissionService.requirePermission(session.user.id, 'role:create');

    const roleService = new RoleService();
    const role = await roleService.createRole(validated);

    return ok(role);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues?.[0].message || "입력값 검증에 실패했습니다.", "VALIDATION_ERROR");
    }
    return errorToResult(error);
  }
}

export async function updateRoleAction(id: string, formData: FormData): Promise<Result<any>> {
  try {
    const data = {
      name: formData.get("name") as string | undefined,
      description: formData.get("description") as string | undefined,
    };

    const validated = roleUpdateSchema.parse(data);

    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }
    await permissionService.requirePermission(session.user.id, 'role:update');

    const roleService = new RoleService();
    const role = await roleService.updateRole(id, validated);

    return ok(role);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues?.[0].message || "입력값 검증에 실패했습니다.", "VALIDATION_ERROR");
    }
    return errorToResult(error);
  }
}

export async function deleteRoleAction(id: string): Promise<Result<void>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }
    await permissionService.requirePermission(session.user.id, 'role:delete');

    const roleService = new RoleService();
    await roleService.deleteRole(id);

    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getRoleAction(id: string): Promise<Result<any>> {
  try {
    const roleService = new RoleService();
    const role = await roleService.getRoleById(id);
    if (!role) {
      return fail("역할을 찾을 수 없습니다.", "NOT_FOUND");
    }
    return ok(role);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getAllRolesAction(): Promise<Result<any>> {
  try {
    const roleService = new RoleService();
    const roles = await roleService.getAllRoles();
    return ok(roles);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function updateRolePermissionsAction(roleId: string, permissionIds: string[]): Promise<Result<void>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }
    await permissionService.requirePermission(session.user.id, 'role:update_permissions');

    const roleService = new RoleService();
    await roleService.updateRolePermissions(roleId, permissionIds);

    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}

