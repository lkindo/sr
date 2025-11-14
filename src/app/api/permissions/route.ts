import { NextRequest, NextResponse } from "next/server";
import { PermissionService } from "@/services/permission.service";
import { withAuth } from "@/lib/auth-wrapper";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/permissions - 모든 권한 조회
export const GET = withAuth(async (request: NextRequest) => {
  const permissionService = new PermissionService();
  const permissions = await permissionService.getAllPermissions();

  return NextResponse.json(permissions);
});
