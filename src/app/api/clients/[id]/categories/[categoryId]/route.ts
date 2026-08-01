import { NextRequest, NextResponse } from 'next/server';

import { parseJsonBody, RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { ensureCanUpdateClient, isInternalUser } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { serviceCategoryUpdateSchema } from '@/lib/schemas';
import { serviceCategoryService } from '@/services/service-category.service';

export const runtime = 'nodejs';

type CategoryParams = RouteContext<{ id: string; categoryId: string }>['params'];

/**
 * 카테고리가 실제로 이 고객사의 것인지 확인한다.
 *
 * URL 의 clientId 만 믿으면 다른 고객사의 categoryId 를 끼워 넣어 수정·삭제할 수 있다
 * (경로 파라미터 두 개가 서로 무관한 IDOR).
 */
async function ensureCategoryOfClient(clientId: string, categoryId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    throw new NotFoundError('고객사');
  }

  const category = await prisma.serviceCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, clientId: true },
  });
  if (!category || category.clientId !== clientId) {
    throw new NotFoundError('서비스 카테고리');
  }

  return category;
}

/** 이 고객사의 카테고리를 변경할 권한이 있는지. */
function ensureCanManageCategories(
  user: AuthenticatedContext<CategoryParams>['session']['user'],
  clientId: string
) {
  ensureCanUpdateClient(user);

  if (!isInternalUser(user)) {
    const userClientIds = user.clientIds || [];
    if (!userClientIds.includes(clientId)) {
      throw new ForbiddenError('해당 고객사의 카테고리를 관리할 권한이 없습니다.');
    }
  }
}

// PATCH /api/clients/[id]/categories/[categoryId] - 서비스 카테고리 수정
export const PATCH = withAuthAndRateLimit(
  async (request: NextRequest, { session, params }: AuthenticatedContext<CategoryParams>) => {
    const { id, categoryId } = await params;

    await ensureCategoryOfClient(id, categoryId);
    ensureCanManageCategories(session.user, id);

    const body = await parseJsonBody(request);

    let validated;
    try {
      // clientId 는 URL 이 결정한다. 바디로 넘어온 값은 무시해야
      // 카테고리를 다른 고객사로 옮기는 경로가 생기지 않는다.
      const { clientId: _ignored, ...rest } = (body ?? {}) as Record<string, unknown>;
      validated = serviceCategoryUpdateSchema.parse(rest);
    } catch (error) {
      if (error instanceof Error && 'issues' in error) {
        const zodError = error as { issues: Array<{ message: string }> };
        throw new ValidationError(zodError.issues[0].message);
      }
      throw error;
    }

    const category = await serviceCategoryService.update(categoryId, validated);

    return NextResponse.json(category);
  },
  { preset: 'strict' }
);

// DELETE /api/clients/[id]/categories/[categoryId] - 서비스 카테고리 삭제
// SR 이 연결되어 있으면 서비스 계층이 409(ReferentialIntegrityError)로 막고 비활성화를 안내한다.
export const DELETE = withAuthAndRateLimit(
  async (_request: NextRequest, { session, params }: AuthenticatedContext<CategoryParams>) => {
    const { id, categoryId } = await params;

    await ensureCategoryOfClient(id, categoryId);
    ensureCanManageCategories(session.user, id);

    await serviceCategoryService.delete(categoryId);

    return NextResponse.json({ success: true });
  },
  { preset: 'strict' }
);
