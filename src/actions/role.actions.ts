'use server';

import type { Permission, Role } from '@prisma/client';

import { authenticateAndAuthorize, validateWithSchema } from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { getFormDataValue } from '@/lib/form-data-parser';
import { PERMISSIONS } from '@/lib/permission-helpers';
import { fail, ok, Result } from '@/lib/result';
import { roleCreateSchema, rolePermissionsUpdateSchema, roleUpdateSchema } from '@/lib/schemas';
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

    // 서비스가 감사 로그에 행위자를 남기고 정책을 판정하려면 session 이 필요하다.
    // 예전에는 반환값을 버려서 ROLE_CREATE 감사 로그의 userId 가 비어 있었다 —
    // "누가 이 역할을 만들었나"에 답할 수 없었다. update/delete 는 감사 3.11 에서
    // 이미 고쳤는데 생성 경로만 빠져 있었다.
    const session = await authenticateAndAuthorize(PERMISSIONS.ROLE.CREATE);

    const roleService = services.roleService;
    const role = await roleService.createRole(validated, session.user.id, null, session.user);

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
    const session = await authenticateAndAuthorize(PERMISSIONS.ROLE.UPDATE);

    const roleService = services.roleService;
    const role = await roleService.updateRole(id, validated, session.user.id, null, session.user);

    return ok(role);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function deleteRoleAction(id: string): Promise<Result<void>> {
  try {
    const session = await authenticateAndAuthorize(PERMISSIONS.ROLE.DELETE);

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
    const validationResult = validateWithSchema(
      { roleId, permissionIds },
      rolePermissionsUpdateSchema
    );
    if (!validationResult.success) {
      return validationResult;
    }

    const session = await authenticateAndAuthorize(PERMISSIONS.ROLE.ASSIGN_PERMISSION);

    const roleService = services.roleService;
    await roleService.updateRolePermissions(
      validationResult.data.roleId,
      validationResult.data.permissionIds,
      session.user.id,
      null,
      session.user
    );

    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}
