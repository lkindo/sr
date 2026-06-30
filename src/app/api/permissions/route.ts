import { NextRequest, NextResponse } from 'next/server';

import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ensureCanReadRole } from '@/lib/policies';
import { PermissionService } from '@/services/permission.service';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/permissions - 모든 권한 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (_request: NextRequest, { session }: AuthenticatedContext) => {
    // 권한 체크: 권한 카탈로그(RBAC 스키마) 노출 방지 (ADMIN 또는 ROLE:READ)
    ensureCanReadRole(session.user);

    const permissionService = new PermissionService();
    const permissions = await permissionService.getAllPermissions();

    return NextResponse.json(permissions);
  },
  { preset: 'standard' }
);
