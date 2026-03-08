import { NextRequest, NextResponse } from 'next/server';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError } from '@/lib/errors';
import { ensureCanReadSR } from '@/lib/policies';
import prisma from '@/lib/prisma';

// GET /api/srs/[id]/activities - SR 활동 이력 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const sr = await prisma.sR.findUnique({
      where: { id },
      select: { id: true, clientId: true, requesterId: true },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    ensureCanReadSR(session.user, sr as any);

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
    });

    if (!activities) {
      throw new NotFoundError('활동 이력');
    }

    return NextResponse.json(activities);
  },
  { preset: 'standard' }
); // 1분당 100회
