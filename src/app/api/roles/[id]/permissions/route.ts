import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError, ValidationError } from '@/lib/errors';
import prisma from '@/lib/prisma';

const permissionAssignSchema = z.object({
  permissionIds: z.array(z.string()),
});

// POST /api/roles/[id]/permissions - 역할에 권한 할당 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const body = await request.json();
    let validated;
    try {
      validated = permissionAssignSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message);
      }
      throw error;
    }

    // Check if role exists
    const role = await prisma.role.findUnique({
      where: { id },
    });

    if (!role) {
      throw new NotFoundError('역할을 찾을 수 없습니다.');
    }

    // Delete existing permissions
    await prisma.rolePermission.deleteMany({
      where: { roleId: id },
    });

    // Add new permissions
    if (validated.permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: validated.permissionIds.map((permissionId) => ({
          roleId: id,
          permissionId,
        })),
      });
    }

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
