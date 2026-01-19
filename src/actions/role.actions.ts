'use server';

import type { Permission, Role } from '@prisma/client';

import { authenticateAndAuthorize, validateWithSchema } from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { getFormDataValue } from '@/lib/form-data-parser';
import { fail, ok, Result } from '@/lib/result';
import { roleCreateSchema, roleUpdateSchema } from '@/lib/schemas';
import { RoleService } from '@/services/role.service';

export async function createRoleAction(formData: FormData): Promise<Result<Role>> {
  try {
    const data = {
      name: getFormDataValue(formData, 'name') || '',
      description: getFormDataValue(formData, 'description') || undefined,
    };

    const validationResult = validateWithSchema(data, roleCreateSchema);
    if (!validationResult.success) {
      return validationResult;
    }
    const validated = validationResult.data;

    await authenticateAndAuthorize('role:create');

    const roleService = new RoleService();
    const role = await roleService.createRole(validated);

    return ok(role);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function updateRoleAction(id: string, formData: FormData): Promise<Result<Role>> {
  try {
    const data = {
      name: getFormDataValue(formData, 'name') || undefined,
      description: getFormDataValue(formData, 'description') || undefined,
    };

    const validationResult = validateWithSchema(data, roleUpdateSchema);
    if (!validationResult.success) {
      return validationResult;
    }
    const validated = validationResult.data;

    await authenticateAndAuthorize('role:update');

    const roleService = new RoleService();
    const role = await roleService.updateRole(id, validated);

    return ok(role);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function deleteRoleAction(id: string): Promise<Result<void>> {
  try {
    await authenticateAndAuthorize('role:delete');

    const roleService = new RoleService();
    await roleService.deleteRole(id);

    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getRoleAction(id: string): Promise<Result<Role>> {
  try {
    const roleService = new RoleService();
    const role = await roleService.getRoleById(id);
    if (!role) {
      return fail('역할을 찾을 수 없습니다.', 'NOT_FOUND');
    }
    return ok(role);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getAllRolesAction(): Promise<
  Result<
    (Role & {
      permissions: Array<{
        permission: Permission;
      }>;
      _count: {
        users: number;
      };
    })[]
  >
> {
  try {
    const roleService = new RoleService();
    const roles = await roleService.getAllRoles();
    return ok(roles);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function updateRolePermissionsAction(
  roleId: string,
  permissionIds: string[]
): Promise<Result<void>> {
  try {
    await authenticateAndAuthorize('role:update_permissions');

    const roleService = new RoleService();
    await roleService.updateRolePermissions(roleId, permissionIds);

    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}
