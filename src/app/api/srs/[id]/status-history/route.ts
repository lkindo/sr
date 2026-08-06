import { NextRequest, NextResponse } from 'next/server';

import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError } from '@/lib/errors';
import { ensureCanReadSR } from '@/lib/policies';
import prisma from '@/lib/prisma';

/**
 * GET /api/srs/[id]/status-history
 * SR 상태 변경 이력 조회 (페이징 지원) (Rate Limit: 표준)
 */
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session, params }: AuthenticatedContext) => {
    const srId = (await params).id;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    // SR 존재 여부 확인 및 권한 검증
    const sr = await prisma.sR.findUnique({
      where: { id: srId },
    });

    if (!sr) {
      throw new NotFoundError('SR을 찾을 수 없습니다.');
    }

    ensureCanReadSR(session.user, sr);

    // 상태 히스토리 조회
    const [items, total] = await Promise.all([
      prisma.sRStatusHistory.findMany({
        where: { srId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: { changedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sRStatusHistory.count({
        where: { srId },
      }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  },
  { preset: 'standard' }
);
