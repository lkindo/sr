"use server";

import { PermissionService } from "@/services/permission.service";
import { Result, ok } from "@/lib/result";
import { errorToResult } from "@/lib/errors";
import { getAuthenticatedSession } from "@/lib/action-helpers";
import type { Permission } from "@prisma/client";

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
