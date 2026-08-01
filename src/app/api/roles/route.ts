import { NextRequest, NextResponse } from 'next/server';

import { validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ensureCanCreateRole, ensureCanReadRole } from '@/lib/policies';
import { roleCreateSchema } from '@/lib/schemas';
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

// POST /api/roles - 새 역할 생성 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(
  async (request: NextRequest, { session }: AuthenticatedContext) => {
    // 권한 체크: 역할 생성 권한(ADMIN 또는 ROLE:CREATE)
    ensureCanCreateRole(session.user);

    // 여기서 검증하면 zod 오류가 ValidationError(400)로 매핑된다.
    // 서비스도 같은 스키마로 다시 파싱하므로(멱등) 계약은 그대로다.
    const body = await validateRequestBody(request, roleCreateSchema);

    const roleService = new RoleService();
    const role = await roleService.createRole(body);

    return NextResponse.json(role, { status: 201 });
  },
  { preset: 'strict' }
);
