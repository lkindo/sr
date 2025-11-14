"use server";

import { PermissionService } from "@/services/permission.service";
import { auth } from "@/auth";

export async function getAllPermissionsAction() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "인증되지 않은 사용자입니다." };
    }
    // Admin check or specific permission check can be added here if needed
    // await permissionService.requirePermission(session.user.id, 'permission:read_all');

    const permissionService = new PermissionService();
    const permissions = await permissionService.getAllPermissions();
    return { success: true, data: permissions };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "권한 목록 조회 중 오류가 발생했습니다." };
  }
}
