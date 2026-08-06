import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { INTERNAL_ROLES } from '@/lib/policies';
import prisma from '@/lib/prisma';

const roleAssignSchema = z.object({
  roleIds: z.array(z.string()),
});

// POST /api/users/[id]/roles - 사용자에게 역할 할당 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 권한 체크: 역할 할당 권한(ADMIN 또는 ROLE:ASSIGN)이 있어야 함
    // (인증만 하는 withAuthAndRateLimit 만으로는 인가가 보장되지 않으므로 필수)
    const canAssignRoles =
      session.user.roles.includes('ADMIN') || session.user.permissions.includes('ROLE:ASSIGN');
    if (!canAssignRoles) {
      throw new ForbiddenError('역할을 할당할 권한이 없습니다.');
    }

    const validated = await validateRequestBody(request, roleAssignSchema);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        clients: {
          include: {
            client: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('사용자');
    }

    // 역할 상호 배타성 검증
    if (validated.roleIds.length > 0) {
      const roles = await prisma.role.findMany({
        where: {
          id: { in: validated.roleIds },
        },
        select: { id: true, name: true },
      });

      const roleNames = roles.map((r) => r.name);

      // 존재하지 않는 roleId 사전 차단: 잘못된 id 로 createMany 가 실패하면
      // 아래 교체 트랜잭션이 롤백되지만, 사전 검증으로 명확한 400 을 반환한다.
      const foundRoleIds = new Set(roles.map((r) => r.id));
      const missingRoleIds = validated.roleIds.filter((rid) => !foundRoleIds.has(rid));
      if (missingRoleIds.length > 0) {
        throw new ValidationError('존재하지 않는 역할이 포함되어 있습니다.');
      }

      // 권한 상승 방지: ADMIN 역할 할당은 ADMIN만 가능
      if (!session.user.roles.includes('ADMIN') && roleNames.includes('ADMIN')) {
        throw new ForbiddenError('ADMIN 역할은 ADMIN만 할당할 수 있습니다.');
      }

      const SYSTEM_TEAM_ROLES = INTERNAL_ROLES;
      const CLIENT_TEAM_ROLES = ['CLIENT_ADMIN', 'CLIENT_USER'];

      const hasSystemTeamRole = roleNames.some((name) => SYSTEM_TEAM_ROLES.includes(name));
      const hasClientTeamRole = roleNames.some((name) => CLIENT_TEAM_ROLES.includes(name));

      // 1. 시스템 운영팀과 고객사 팀 역할을 동시에 할당하려는 경우 차단
      if (hasSystemTeamRole && hasClientTeamRole) {
        const systemRoles = roleNames.filter((name) => SYSTEM_TEAM_ROLES.includes(name));
        const clientRoles = roleNames.filter((name) => CLIENT_TEAM_ROLES.includes(name));

        return NextResponse.json(
          {
            error: '시스템 운영팀과 고객사 팀 역할을 동시에 부여할 수 없습니다',
            details: `시스템 운영팀 역할(${systemRoles.join(', ')})과 고객사 팀 역할(${clientRoles.join(', ')})은 상호 배타적입니다.`,
            suggestion: '하나의 역할 그룹만 선택하세요.',
            systemRoles,
            clientRoles,
          },
          { status: 400 }
        );
      }

      // 2. 시스템 운영팀 역할을 고객사 할당 사용자에게 부여하려는 경우 차단
      if (hasSystemTeamRole && user.clients.length > 0) {
        const clientNames = user.clients.map((uc) => uc.client.name).join(', ');
        const systemRoles = roleNames.filter((name) => SYSTEM_TEAM_ROLES.includes(name));

        return NextResponse.json(
          {
            error: '시스템 운영팀 역할은 고객사가 할당된 사용자에게 부여할 수 없습니다',
            details: `사용자는 현재 다음 고객사에 할당되어 있습니다: ${clientNames}`,
            suggestion: '먼저 고객사 할당을 해제한 후 시스템 운영팀 역할을 부여하세요.',
            systemRoles,
            assignedClients: user.clients.map((uc) => ({
              id: uc.client.id,
              name: uc.client.name,
            })),
          },
          { status: 400 }
        );
      }

      // 3. 고객사 팀 역할을 고객사 미할당 사용자에게 부여하려는 경우 차단
      if (hasClientTeamRole && user.clients.length === 0) {
        const clientRoles = roleNames.filter((name) => CLIENT_TEAM_ROLES.includes(name));

        return NextResponse.json(
          {
            error: '고객사 팀 역할은 고객사가 할당된 사용자에게만 부여할 수 있습니다',
            details: `${clientRoles.join(', ')} 역할을 부여하려면 먼저 사용자에게 고객사를 할당해야 합니다.`,
            suggestion: '먼저 사용자에게 고객사를 할당한 후 고객사 팀 역할을 부여하세요.',
            clientRoles,
          },
          { status: 400 }
        );
      }
    }

    // 역할 교체는 원자적으로 수행한다: 삭제와 생성을 하나의 트랜잭션으로 묶어,
    // 중간 실패 시 사용자가 역할 0개(잠금) 상태로 남는 것을 방지한다.
    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      if (validated.roleIds.length > 0) {
        await tx.userRole.createMany({
          data: validated.roleIds.map((roleId) => ({ userId: id, roleId })),
          skipDuplicates: true,
        });
      }
    });

    // Fetch updated user with roles
    const updatedUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    return NextResponse.json(updatedUser);
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
