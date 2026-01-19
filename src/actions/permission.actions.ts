'use server';

import type { Permission } from '@prisma/client';

import { getAuthenticatedSession } from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { ok, Result } from '@/lib/result';
import { PermissionService } from '@/services/permission.service';

export async function getAllPermissionsAction(): Promise<Result<Permission[]>> {
  try {
    await getAuthenticatedSession();

    const permissionService = new PermissionService();
    const permissions = await permissionService.getAllPermissions();
    return ok(permissions);
  } catch (error) {
    return errorToResult(error);
  }
}
