import { NextRequest, NextResponse } from 'next/server';

import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // SR 존재 여부 확인 및 권한 검증
    const sr = await prisma.sR.findUnique({
      where: { id: srId },
    });

    if (!sr) {
      return NextResponse.json({ error: 'SR을 찾을 수 없습니다' }, { status: 404 });
    }

    try {
      ensureCanReadSR(session.user, sr);
    } catch (error) {
      return NextResponse.json({ error: 'SR 조회 권한이 없습니다.' }, { status: 403 });
    }

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
