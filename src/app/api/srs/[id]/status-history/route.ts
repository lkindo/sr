import { NextRequest, NextResponse } from 'next/server';

import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { PAGINATION } from '@/lib/constants';
import { NotFoundError } from '@/lib/errors';
import { ensureCanReadSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SR_ACCESS_SELECT, SR_ALIVE } from '@/lib/prisma-selects';

/**
 * GET /api/srs/[id]/status-history
 * SR 상태 변경 이력 조회 (페이징 지원) (Rate Limit: 표준)
 */
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session, params }: AuthenticatedContext) => {
    const srId = (await params).id;
    const { searchParams } = new URL(request.url);
    /**
     * 페이지네이션 파라미터 정규화.
     *
     * 두 가지를 고친다.
     * 1. **NaN 방어**: `parseInt('abc')` 는 NaN 이고 `Math.max(1, NaN)` 도 NaN 이다.
     *    그대로 `skip` 에 들어가면 Prisma 가 던져 **사용자 입력 하나로 500** 이 난다.
     * 2. **공용 상한 적용**: `PAGINATION.MAX_PAGE` 주석은 "모든 목록 진입점에서 같은 상한"
     *    을 규정하는데 이 라우트만 밖에 있었고, 페이지 상한이 아예 없었다.
     *
     * 응답 봉투(`{items,total,page,limit,totalPages}`)는 그대로 둔다 —
     * `usePagination` 으로 전면 전환하면 쿼리 파라미터가 `limit`→`pageSize` 로 바뀌는
     * 외부 계약 변경이 되므로 여기서는 상한만 확보한다.
     */
    const toBounded = (raw: string | null, fallback: number, max: number) => {
      const parsed = Number.parseInt(raw ?? '', 10);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.max(1, Math.min(max, parsed));
    };

    const page = toBounded(searchParams.get('page'), 1, PAGINATION.MAX_PAGE);
    const limit = toBounded(searchParams.get('limit'), 20, PAGINATION.MAX_PAGE_SIZE);
    const skip = (page - 1) * limit;

    // SR 존재 여부 확인 및 권한 검증
    // 인가 판정에만 쓰므로 전체 행을 읽지 않는다(db-rules §4).
    const sr = await prisma.sR.findUnique({
      where: { id: srId, ...SR_ALIVE },
      select: SR_ACCESS_SELECT,
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
