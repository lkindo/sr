import { NextRequest, NextResponse } from 'next/server';
import { NotificationStatus, Prisma } from '@prisma/client';
import { z } from 'zod';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError } from '@/lib/errors';
import { usePagination } from '@/lib/pagination';
import prisma from '@/lib/prisma';
import { serializeResponse } from '@/lib/serialization';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

/**
 * GET /api/notifications/outbox — 알림 아웃박스 조회 (ADMIN 전용)
 *
 * 헌법 §4.1 은 "발송 실패는 조회 가능해야 한다" 고 규정한다. 그런데 아웃박스를 만들어
 * 놓고도 그것을 읽는 코드가 저장소에 0건이라, 실패한 알림을 확인하려면 운영자가 DB 에
 * 직접 붙어야 했다 — 사실상 아무도 확인하지 않는다는 뜻이다.
 *
 * 본문(`content`)은 **의도적으로 내려보내지 않는다.** 알림 본문에는 SR 제목과 수신자
 * 정보가 들어 있고, 운영자가 알아야 하는 것은 "무엇이 왜 실패했는가" 지 본문이 아니다.
 * (발송에 성공한 행은 디스패처가 본문을 비우기도 한다.)
 */

const querySchema = z.object({
  status: z.preprocess((v) => v || undefined, z.nativeEnum(NotificationStatus).optional()),
});

export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    // 전체 시스템의 알림 이력이므로 테넌트 개념이 없다 — ADMIN 으로 좁힌다.
    if (!session.user.roles?.includes('ADMIN')) {
      throw new ForbiddenError('알림 아웃박스는 시스템 관리자만 조회할 수 있습니다.');
    }

    const { searchParams } = new URL(request.url);
    const { status } = querySchema.parse({ status: searchParams.get('status') });
    const { skip, take, createResponse } = usePagination(request);

    const where: Prisma.NotificationWhereInput = status ? { status } : {};

    const [rows, totalCount, statusGroups] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take,
        // 실패 조사가 목적이므로 최근 것부터 본다.
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          status: true,
          recipient: true,
          subject: true,
          attempts: true,
          failReason: true,
          nextAttemptAt: true,
          sentAt: true,
          createdAt: true,
          metadata: true,
          // content 는 일부러 뺀다(위 주석 참조).
        },
      }),
      prisma.notification.count({ where }),
      prisma.notification.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const counts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));

    return NextResponse.json(
      serializeResponse({
        ...createResponse(rows, totalCount),
        stats: {
          pending: counts.PENDING ?? 0,
          sent: counts.SENT ?? 0,
          failed: counts.FAILED ?? 0,
        },
      })
    );
  },
  { preset: 'relaxed' }
);
