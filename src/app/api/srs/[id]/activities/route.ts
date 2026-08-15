import { NextRequest, NextResponse } from 'next/server';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { PAGINATION } from '@/lib/constants';
import { NotFoundError } from '@/lib/errors';
import { ensureCanReadSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SR_ACCESS_SELECT, SR_ALIVE } from '@/lib/prisma-selects';

// GET /api/srs/[id]/activities - SR 활동 이력 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 인가 판정에만 쓰므로 전체 행을 읽지 않는다(db-rules §4).
    const sr = await prisma.sR.findUnique({
      where: { id, ...SR_ALIVE },
      select: SR_ACCESS_SELECT,
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    ensureCanReadSR(session.user, sr);

    const activities = await prisma.sRActivity.findMany({
      where: { srId: id },
      include: {
        user: {
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
      // 상한을 건다 (감사 D-17). 서비스 계층(`srService.getSRActivities`)은 커서
      // 페이지네이션으로 `MAX_PAGE_SIZE` 를 지키는데 이 라우트만 전량을 조인해 왔다.
      // UI 핫패스는 서비스 쪽을 타므로 눈에 띄지 않았지만, 오래된 SR 을 직접 호출하면
      // 활동 전량이 한 번에 나온다.
      take: PAGINATION.MAX_PAGE_SIZE,
    });

    if (!activities) {
      throw new NotFoundError('활동 이력');
    }

    return NextResponse.json(activities);
  },
  { preset: 'standard' }
); // 1분당 100회
