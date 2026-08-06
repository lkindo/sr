import { NextRequest, NextResponse } from 'next/server';

import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ensureCanReadRole } from '@/lib/policies';
import { RoleService } from '@/services/role.service';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/roles - 모든 역할 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (_request: NextRequest, { session }: AuthenticatedContext) => {
    // 권한 체크: 역할/권한 카탈로그 노출 방지 (ADMIN 또는 ROLE:READ)
    ensureCanReadRole(session.user);

    const roleService = new RoleService();
    const roles = await roleService.getAllRoles();

    return NextResponse.json(roles);
  },
  { preset: 'standard' }
);
