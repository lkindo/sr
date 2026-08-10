import { NextRequest, NextResponse } from 'next/server';

import { parseJsonBody, RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { firstZodIssueMessage, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { ensureCanReadClient, ensureCanUpdateClient, isInternalUser } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { serviceCategoryCreateSchema } from '@/lib/schemas';
import { serviceCategoryService } from '@/services/service-category.service';

// GET /api/clients/[id]/categories - 고객사의 서비스 카테고리 목록 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 고객사 존재 확인 및 권한 검증
    const client = await prisma.client.findUnique({
      where: { id },
    });

    if (!client) {
      throw new NotFoundError('고객사');
    }

    ensureCanReadClient(session.user, client);

    // ServiceCategoryService 활용
    const categories = await serviceCategoryService.getByClientId(id);

    // Map categoryName to name for frontend compatibility
    const mappedCategories = categories.map((cat) => ({
      ...cat,
      name: cat.categoryName,
    }));

    return NextResponse.json(mappedCategories);
  },
  { preset: 'standard' }
); // 1분당 100회

// POST /api/clients/[id]/categories - 서비스 카테고리 생성 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 고객사 존재 확인 및 권한 검증
    const client = await prisma.client.findUnique({
      where: { id },
    });

    if (!client) {
      throw new NotFoundError('고객사');
    }

    ensureCanUpdateClient(session.user);

    if (!isInternalUser(session.user)) {
      const userClientIds = session.user.clientIds || [];
      if (!userClientIds.includes(id)) {
        throw new ForbiddenError('해당 고객사의 카테고리를 생성할 권한이 없습니다.');
      }
    }

    const body = await parseJsonBody(request);
    let validated;
    try {
      validated = serviceCategoryCreateSchema.parse({
        ...((body ?? {}) as Record<string, unknown>),
        clientId: id,
      });
    } catch (error) {
      if (error instanceof Error && 'issues' in error) {
        const zodError = error as { issues: Array<{ message: string }> };
        throw new ValidationError(firstZodIssueMessage(zodError));
      }
      throw error;
    }

    // ServiceCategoryService를 활용한 카테고리 생성
    // 행위자를 넘겨야 감사 로그가 남는다. IP 는 저장소 전체 관례대로 null 이다.
    const category = await serviceCategoryService.create(validated, session.user.id, null);

    return NextResponse.json(category, { status: 201 });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
