import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { parseJsonBody, RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { firstZodIssueMessage, ValidationError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { RoleService } from '@/services/role.service';

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

    // 권한 교체는 RoleService 로 위임한다.
    //
    // 예전에는 이 라우트가 직접 트랜잭션을 돌렸고, 인가는 `ensureCanUpdateRole` 한 줄뿐이라
    // (1) 행위자가 **자기 역할**을 대상으로 삼는 것과 (2) 자기가 보유하지 않은 권한을
    // 부여하는 것을 막지 않았다. 그래서 `ROLE:UPDATE` 하나가 사실상 풀 어드민이었다(감사 3.11).
    //
    // 같은 불변식을 라우트와 서버 액션에 각각 복사하면 다음 진입점에서 또 벌어진다.
    // 서비스 한 곳에서 판정하도록 모은다.
    const roleService = new RoleService();

    // 존재하지 않는 permissionId 사전 차단(잘못된 id 로 교체가 실패해 권한이 전부
    // 사라지는 것을 방지)
    if (validated.permissionIds.length > 0) {
      const existing = await prisma.permission.findMany({
        where: { id: { in: validated.permissionIds } },
        select: { id: true },
      });
      const foundIds = new Set(existing.map((perm) => perm.id));
      const missing = validated.permissionIds.filter((pid) => !foundIds.has(pid));
      if (missing.length > 0) {
        throw new ValidationError('존재하지 않는 권한이 포함되어 있습니다.');
      }
    }

    const updatedRole = await roleService.updateRolePermissions(
      id,
      validated.permissionIds,
      session.user.id,
      null,
      session.user
    );

    return NextResponse.json(updatedRole);
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
