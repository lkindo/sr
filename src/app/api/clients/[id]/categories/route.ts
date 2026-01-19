import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError, ValidationError } from '@/lib/errors';
import prisma from '@/lib/prisma';

const categorySchema = z.object({
  categoryName: z.string().min(2, '카테고리 이름은 최소 2자 이상이어야 합니다.'),
  description: z.string().optional(),
  slaHours: z.number().min(1, 'SLA는 최소 1시간 이상이어야 합니다.'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional().default('MEDIUM'),
  handlerId: z.string().optional(),
  backupHandlerId: z.string().optional(),
});

// GET /api/clients/[id]/categories - 고객사의 서비스 카테고리 목록 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const categories = await prisma.serviceCategory.findMany({
      where: {
        clientId: id,
        isActive: true,
      },
      include: {
        handler: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        backupHandler: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

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
    { params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const body = await request.json();
    let validated;
    try {
      validated = categorySchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message);
      }
      throw error;
    }

    // 고객사 존재 확인
    const client = await prisma.client.findUnique({
      where: { id },
    });

    if (!client) {
      throw new NotFoundError('고객사');
    }

    // 카테고리 생성
    const category = await prisma.serviceCategory.create({
      data: {
        clientId: id,
        categoryName: validated.categoryName,
        description: validated.description,
        slaHours: validated.slaHours,
        priority: validated.priority,
        handlerId: validated.handlerId || null,
        backupHandlerId: validated.backupHandlerId || null,
      },
      include: {
        handler: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        backupHandler: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(category, { status: 201 });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
