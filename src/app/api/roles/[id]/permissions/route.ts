import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { parseJsonBody, RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { firstZodIssueMessage, NotFoundError, ValidationError } from '@/lib/errors';
import { ensureCanUpdateRole } from '@/lib/policies';
import prisma from '@/lib/prisma';

const permissionAssignSchema = z.object({
  permissionIds: z.array(z.string()),
});

// POST /api/roles/[id]/permissions - 역할에 권한 할당 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const body = await parseJsonBody(request);
    let validated;
    try {
      validated = permissionAssignSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(firstZodIssueMessage(error));
      }
      throw error;
    }

    // Check if role exists
    const role = await prisma.role.findUnique({
      where: { id },
    });

    if (!role) {
      throw new NotFoundError('역할');
    }

    // 권한 체크: 역할 수정 권한(ADMIN 또는 ROLE:UPDATE)이 있어야 하며 ADMIN 역할은 변경 불가
    ensureCanUpdateRole(session.user, role);

    // 존재하지 않는 permissionId 사전 차단(잘못된 id 로 교체가 실패해 권한이 전부
    // 사라지는 것을 방지)
    if (validated.permissionIds.length > 0) {
      const existing = await prisma.permission.findMany({
        where: { id: { in: validated.permissionIds } },
        select: { id: true },
      });
      const foundIds = new Set(existing.map((p) => p.id));
      const missing = validated.permissionIds.filter((pid) => !foundIds.has(pid));
      if (missing.length > 0) {
        throw new ValidationError('존재하지 않는 권한이 포함되어 있습니다.');
      }
    }

    // 권한 교체는 원자적으로 수행한다: 삭제와 생성을 하나의 트랜잭션으로 묶어,
    // 중간 실패 시 역할의 권한이 전부 사라지는 상태를 방지한다.
    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (validated.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: validated.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        });
      }
    });

    // Fetch updated role with permissions
    const updatedRole = await prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return NextResponse.json(updatedRole);
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
