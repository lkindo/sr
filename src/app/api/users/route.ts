import { NextRequest, NextResponse } from 'next/server';

import { parseJsonBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ValidationError } from '@/lib/errors';
import {
  ensureCanCreateUser,
  ensureCanGrantRoles,
  ensureCanReadUser,
  ensureClientAssignmentsWithinScope,
  isInternalUser,
  resolveClientIdFilter,
} from '@/lib/policies';
import prisma from '@/lib/prisma';
import { userCreateSchema } from '@/lib/schemas';
import { UserService } from '@/services/user.service';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

import { SORTABLE_FIELDS, usePagination } from '@/lib/pagination';

// GET /api/users - 사용자 목록 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }: AuthenticatedContext) => {
    ensureCanReadUser(session.user);

    const { searchParams } = new URL(request.url);
    const { skip, take, orderBy, createResponse } = usePagination(request, SORTABLE_FIELDS.users);

    const clientIdFilter = resolveClientIdFilter(session.user, searchParams.get('clientId'));
    if (typeof clientIdFilter === 'object' && clientIdFilter.in.length === 0) {
      return NextResponse.json(createResponse([], 0));
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

    const body = await parseJsonBody(request);
    const validatedBody = userCreateSchema.parse(body);
    const requestedClientIds =
      validatedBody.clientIds ?? (validatedBody.clientId ? [validatedBody.clientId] : []);
    ensureClientAssignmentsWithinScope(session.user, requestedClientIds);

    if (!isInternalUser(session.user) && validatedBody.userType === 'ENGINEER') {
      throw new ValidationError('외부 사용자는 시스템 운영팀 사용자를 생성할 수 없습니다.');
    }

    // Security Check: Prevent privilege escalation via role assignment
    if (
      validatedBody.roleIds &&
      Array.isArray(validatedBody.roleIds) &&
      validatedBody.roleIds.length > 0
    ) {
      const rolesToAssign = await prisma.role.findMany({
        where: { id: { in: validatedBody.roleIds } },
        select: {
          id: true,
          name: true,
          permissions: {
            select: { permission: { select: { resource: true, action: true } } },
          },
        },
      });
      if (rolesToAssign.length !== new Set(validatedBody.roleIds).size) {
        throw new ValidationError('존재하지 않는 역할이 포함되어 있습니다.');
      }
      ensureCanGrantRoles(session.user, rolesToAssign);
    }

    const userService = new UserService();
    const user = await userService.createUser(
      {
        ...validatedBody,
        // 외부 관리자가 userType 을 생략해도 역할 없는 내부 사용자가 생기지 않게 한다.
        userType: !isInternalUser(session.user) ? 'CLIENT' : validatedBody.userType,
      },
      session.user.id,
      undefined,
      { membershipStatus: isInternalUser(session.user) ? 'APPROVED' : 'PENDING' }
    );

    return NextResponse.json(user, { status: 201 });
  },
  { preset: 'strict' }
); // 1분당 5회 (사용자 생성은 민감한 작업)
