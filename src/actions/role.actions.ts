'use server';

import type { Permission, Role } from '@prisma/client';

import { authenticateAndAuthorize, validateWithSchema } from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { getFormDataValue } from '@/lib/form-data-parser';
import { PERMISSIONS } from '@/lib/permission-helpers';
import { fail, ok, Result } from '@/lib/result';
import { roleCreateSchema, roleUpdateSchema } from '@/lib/schemas';
import { services } from '@/services/service-registry';

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

    const roleService = services.roleService;
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

    // 서비스가 불변식을 판정하려면 actor 가 필요하다. 예전에는 넘기지 않아서
    // ADMIN 역할 불변·자기 역할 수정 금지가 이 경로에서만 통째로 빠져 있었다(감사 3.11).
    const session = await authenticateAndAuthorize('role:update');

    const roleService = services.roleService;
    const role = await roleService.updateRole(id, validated, session.user.id, null, session.user);

    return ok(role);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function deleteRoleAction(id: string): Promise<Result<void>> {
  try {
    const session = await authenticateAndAuthorize('role:delete');

    const roleService = services.roleService;
    await roleService.deleteRole(id, session.user.id, null, session.user);

    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function updateRolePermissionsAction(
  roleId: string,
  permissionIds: string[]
): Promise<Result<void>> {
  try {
    const session = await authenticateAndAuthorize('role:update_permissions');

    const roleService = services.roleService;
    await roleService.updateRolePermissions(
      roleId,
      permissionIds,
      session.user.id,
      null,
      session.user
    );

    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}
