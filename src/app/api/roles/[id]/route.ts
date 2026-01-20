import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError } from '@/lib/errors';
import { RoleService } from '@/services/role.service';

const roleUpdateSchema = z.object({
  name: z.string().min(2, '역할 이름은 최소 2자 이상이어야 합니다.').optional(),
  description: z.string().optional(),
});

// GET /api/roles/[id] - 특정 역할 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const roleService = new RoleService();
    const role = await roleService.getRoleById(id);

    if (!role) {
      throw new NotFoundError('역할');
    }

    return NextResponse.json(role);
  },
  { preset: 'standard' }
); // 1분당 100회

// PATCH /api/roles/[id] - 역할 수정 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;
    const validated = await validateRequestBody(request, roleUpdateSchema);

    const roleService = new RoleService();
    const role = await roleService.updateRole(id, validated);

    return NextResponse.json(role);
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)

// DELETE /api/roles/[id] - 역할 삭제 (Rate Limit: 엄격)
export const DELETE = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const roleService = new RoleService();
    await roleService.deleteRole(id);

    return NextResponse.json({ message: '역할이 삭제되었습니다.' });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
