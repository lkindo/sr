import { NextRequest, NextResponse } from "next/server";
import { UserService } from "@/services/user.service";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/users - 사용자 목록 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const filters = {
    search: searchParams.get("search") || undefined,
    isActive: searchParams.get("isActive") || undefined,
    userType: searchParams.get("userType") || undefined,
    roleId: searchParams.get("roleId") || undefined,
    role: searchParams.get("role") || undefined,
    clientId: searchParams.get("clientId") || undefined,
  };

  const userService = new UserService();
  const users = await userService.getAllUsers(filters);

  return NextResponse.json(users);
}, { preset: 'standard' }); // 1분당 100회

// POST /api/users - 새 사용자 생성 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(async (request: NextRequest) => {
  const body = await request.json();

  const userService = new UserService();
  const user = await userService.createUser(body);

  return NextResponse.json(user, { status: 201 });
}, { preset: 'strict' }); // 1분당 5회 (사용자 생성은 민감한 작업)


