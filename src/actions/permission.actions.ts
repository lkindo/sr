'use server';

import type { Permission } from '@prisma/client';

import { authenticateAndAuthorize } from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/permission-helpers';
import { ok, Result } from '@/lib/result';
import type { PermissionService } from '@/services/permission.service';
import { services } from '@/services/service-registry';

export async function getAllPermissionsAction(): Promise<Result<Permission[]>> {
  try {
    await authenticateAndAuthorize(PERMISSIONS.ROLE.READ);

    const permissionService = services.permissionService;
    const permissions = await permissionService.getAllPermissions();
    return ok(permissions);
  } catch (error) {
    return errorToResult(error);
  }
}
