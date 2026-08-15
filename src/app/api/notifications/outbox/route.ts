import { NextRequest, NextResponse } from 'next/server';
import { NotificationStatus, Prisma } from '@prisma/client';
import { z } from 'zod';

import { parseJsonBody } from '@/lib/api-helpers';
import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError } from '@/lib/errors';
import { logger } from '@/lib/logger';
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

/** 재발송 요청. 한 번에 되살릴 수 있는 건수를 제한해 실수로 전량을 재발송하지 못하게 한다. */
const resendSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '재발송할 알림을 선택해주세요.').max(100),
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

/**
 * POST /api/notifications/outbox — 실패한 알림 재발송 (ADMIN 전용)
 *
 * 헌법 §4.1 은 "실패한 알림을 운영자가 확인하고 재발송할 수 있는 경로를 제공한다" 고
 * 규정한다. 조회만으로는 절반이다 — SMTP 가 일시적으로 죽어 dead-letter 로 떨어진 알림을
 * 되살릴 방법이 없으면 운영자가 할 수 있는 일은 DB 를 직접 고치는 것뿐이다.
 *
 * 재발송은 새 행을 만들지 않고 기존 행을 `PENDING` 으로 되돌린다. 그래야 원래의 수신자·
 * 제목·metadata 가 유지되고, `attempts` 를 0 으로 리셋해야 백오프가 처음부터 다시 센다.
 * 실제 발송은 다음 디스패처 tick(최대 30초)이 맡는다.
 */
export const POST = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    if (!session.user.roles?.includes('ADMIN')) {
      throw new ForbiddenError('알림 재발송은 시스템 관리자만 수행할 수 있습니다.');
    }

    const body = await parseJsonBody(request);
    const { ids } = resendSchema.parse(body);

    // **`FAILED` 만 되살린다.** PENDING 은 아직 디스패처가 처리할 예정이고,
    // SENT 를 되살리면 수신자에게 같은 메일이 한 번 더 간다.
    const { count } = await prisma.notification.updateMany({
      where: { id: { in: ids }, status: 'FAILED' },
      data: { status: 'PENDING', attempts: 0, failReason: null, nextAttemptAt: null },
    });

    logger.info('[Outbox] 실패 알림 재발송 요청', {
      userId: session.user.id,
      custom_requested: ids.length,
      custom_requeued: count,
    });

    return NextResponse.json({
      success: true,
      requeued: count,
      // 요청한 것과 실제 되살린 수가 다를 수 있다(이미 SENT 이거나 없는 id).
      skipped: ids.length - count,
      message:
        count > 0
          ? `${count}건을 재발송 대기열에 넣었습니다. 최대 30초 내에 발송됩니다.`
          : '재발송할 수 있는 실패 알림이 없습니다.',
    });
  },
  { preset: 'strict' }
);
