import { NextRequest, NextResponse } from 'next/server';

import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ensureCanCreateUser, ensureCanReadUser } from '@/lib/policies';
import { UserService } from '@/services/user.service';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

import { usePagination } from '@/lib/pagination';

// GET /api/users - 사용자 목록 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }: AuthenticatedContext) => {
    ensureCanReadUser(session.user);

    const { searchParams } = new URL(request.url);
    const { skip, take, orderBy, createResponse } = usePagination(request);

    const filters = {
      search: searchParams.get('search') || undefined,
      isActive: searchParams.get('isActive') || undefined,
      userType: searchParams.get('userType') || undefined,
      roleId: searchParams.get('roleId') || undefined,
      role: searchParams.get('role') || undefined,
      clientId: searchParams.get('clientId') || undefined,
    };

    const userService = new UserService();
    const { data, total } = await userService.getAllUsers(filters, { skip, take, orderBy });

    return NextResponse.json(createResponse(data, total));
  },
  { preset: 'standard' }
); // 1분당 100회

// POST /api/users - 새 사용자 생성 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(
  async (request: NextRequest, { session }: AuthenticatedContext) => {
    ensureCanCreateUser(session.user);

    const body = await request.json();

    const userService = new UserService();
    const user = await userService.createUser(body);

    return NextResponse.json(user, { status: 201 });
  },
  { preset: 'strict' }
); // 1분당 5회 (사용자 생성은 민감한 작업)
