import { NextRequest, NextResponse } from "next/server";
import { RoleService } from "@/services/role.service";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/roles - 모든 역할 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (_request: NextRequest) => {
  const roleService = new RoleService();
  const roles = await roleService.getAllRoles();

  return NextResponse.json(roles);
}, { preset: 'standard' });

// POST /api/roles - 새 역할 생성 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(async (request: NextRequest) => {
  const body = await request.json();

  const roleService = new RoleService();
  const role = await roleService.createRole(body);

  return NextResponse.json(role, { status: 201 });
}, { preset: 'strict' });
