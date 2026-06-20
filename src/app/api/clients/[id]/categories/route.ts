import { NextRequest, NextResponse } from 'next/server';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
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

    const body = await request.json();
    let validated;
    try {
      validated = serviceCategoryCreateSchema.parse({
        ...body,
        clientId: id,
      });
    } catch (error) {
      if (error instanceof Error && 'issues' in error) {
        const zodError = error as { issues: Array<{ message: string }> };
        throw new ValidationError(zodError.issues[0].message);
      }
      throw error;
    }

    // ServiceCategoryService를 활용한 카테고리 생성
    const category = await serviceCategoryService.create(validated);

    return NextResponse.json(category, { status: 201 });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
