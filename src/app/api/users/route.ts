import { NextRequest, NextResponse } from 'next/server';

import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError } from '@/lib/errors';
import { ensureCanCreateUser, ensureCanReadUser, isInternalUser } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { userCreateSchema } from '@/lib/schemas';
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

    let clientIdFilter: string | { in: string[] } | undefined =
      searchParams.get('clientId') || undefined;

    // Multi-tenant Isolation: External users must be restricted to their assigned clients' users
    if (!isInternalUser(session.user)) {
      const userClientIds = session.user.clientIds || [];

      if (userClientIds.length === 0) {
        return NextResponse.json(createResponse([], 0));
      }

      if (typeof clientIdFilter === 'string') {
        if (!userClientIds.includes(clientIdFilter)) {
          return NextResponse.json(createResponse([], 0));
        }
      } else {
        clientIdFilter = { in: userClientIds };
      }
    }

    const filters = {
      search: searchParams.get('search') || undefined,
      isActive: searchParams.get('isActive') || undefined,
      userType: searchParams.get('userType') || undefined,
      roleId: searchParams.get('roleId') || undefined,
      role: searchParams.get('role') || undefined,
      clientId: clientIdFilter,
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
    const validatedBody = userCreateSchema.parse(body);

    // Security Check: Prevent privilege escalation via role assignment
    if (
      validatedBody.roleIds &&
      Array.isArray(validatedBody.roleIds) &&
      validatedBody.roleIds.length > 0
    ) {
      // 1. Check if user has permission to assign roles
      const canAssignRoles =
        session.user.roles.includes('ADMIN') || session.user.permissions.includes('ROLE:ASSIGN');

      if (!canAssignRoles) {
        throw new ForbiddenError('역할을 직접 할당할 권한이 없습니다.');
      }

      // 2. Check if user is trying to assign ADMIN role without being ADMIN
      if (!session.user.roles.includes('ADMIN')) {
        const rolesToAssign = await prisma.role.findMany({
          where: {
            id: { in: validatedBody.roleIds },
          },
          select: { name: true },
        });

        const isAssigningAdmin = rolesToAssign.some((r) => r.name === 'ADMIN');
        if (isAssigningAdmin) {
          throw new ForbiddenError('ADMIN 역할은 ADMIN만 할당할 수 있습니다.');
        }
      }
    }

    const userService = new UserService();
    const user = await userService.createUser(validatedBody);

    return NextResponse.json(user, { status: 201 });
  },
  { preset: 'strict' }
); // 1분당 5회 (사용자 생성은 민감한 작업)
