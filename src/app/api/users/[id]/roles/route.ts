import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { withAuthAndRateLimit, AuthenticatedContext } from "@/lib/auth-wrapper";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { RouteContext } from "@/lib/api-helpers";

const roleAssignSchema = z.object({
  roleIds: z.array(z.string()),
});

// POST /api/users/[id]/roles - 사용자에게 역할 할당 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(async (
  request: NextRequest,
  { session, params }: AuthenticatedContext<RouteContext<{ id: string }>["params"]>
) => {
  const { id } = await params;

  const body = await request.json();
  let validated;
  try {
    validated = roleAssignSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.issues[0].message);
    }
    throw error;
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      clients: {
        include: {
          client: {
            select: { id: true, name: true }
          }
        }
      }
    }
  });

  if (!user) {
    throw new NotFoundError("사용자");
  }

  // 시스템 운영팀 역할(ADMIN, MANAGER, ENGINEER)을 할당하려는 경우
  // 기존 고객사 할당이 있으면 차단
  if (validated.roleIds.length > 0) {
    const roles = await prisma.role.findMany({
      where: {
        id: { in: validated.roleIds }
      },
      select: { id: true, name: true }
    });

    const hasSystemTeamRole = roles.some(role =>
      ['ADMIN', 'MANAGER', 'ENGINEER'].includes(role.name)
    );

    if (hasSystemTeamRole && user.clients.length > 0) {
      const clientNames = user.clients.map(uc => uc.client.name).join(', ');
      const systemRoles = roles
        .filter(role => ['ADMIN', 'MANAGER', 'ENGINEER'].includes(role.name))
        .map(role => role.name)
        .join(', ');

      return NextResponse.json(
        {
          error: "시스템 운영팀 역할은 고객사가 할당된 사용자에게 부여할 수 없습니다",
          details: `사용자는 현재 다음 고객사에 할당되어 있습니다: ${clientNames}`,
          suggestion: "먼저 고객사 할당을 해제한 후 시스템 운영팀 역할을 부여하세요.",
          systemRoles,
          assignedClients: user.clients.map(uc => ({
            id: uc.client.id,
            name: uc.client.name
          }))
        },
        { status: 400 }
      );
    }
  }

  // Delete existing roles
  await prisma.userRole.deleteMany({
    where: { userId: id },
  });

  // Add new roles
  if (validated.roleIds.length > 0) {
    await prisma.userRole.createMany({
      data: validated.roleIds.map((roleId) => ({
        userId: id,
        roleId,
      })),
    });
  }

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
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)

