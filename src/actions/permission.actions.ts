"use server";

import { PermissionService } from "@/services/permission.service";
import { auth } from "@/auth";
import { Result, ok } from "@/lib/result";
import { errorToResult, UnauthorizedError } from "@/lib/errors";

export async function getAllPermissionsAction(): Promise<Result<any>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }

    const permissionService = new PermissionService();
    const permissions = await permissionService.getAllPermissions();
    return ok(permissions);
  } catch (error) {
    return errorToResult(error);
  }
}
