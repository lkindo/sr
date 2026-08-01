import { NextRequest, NextResponse } from 'next/server';
import { Prisma, SRStatus } from '@prisma/client';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { usePagination } from '@/lib/pagination';
import prisma from '@/lib/prisma';
import { serializeResponse } from '@/lib/serialization';

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 허용된 정렬 필드.
 *
 * `usePagination` 의 `orderBy` 는 sortBy 문자열을 그대로 Prisma 키로 넘기므로
 * 이 라우트에서는 쓰지 않고 명시적 allowlist 로 제한한다.
 * (임의 필드명이 통과하면 Prisma 가 런타임에 터지거나 의도치 않은 관계로 정렬된다)
 */
const DEFAULT_ORDER_BY: Prisma.SROrderByWithRelationInput = { createdAt: 'desc' };

// 평범한 객체 대신 Map 을 쓴다. 객체였다면 `?sortBy=constructor` 같은 입력이
// 프로토타입 체인에서 값을 찾아 `??` 기본값 분기를 건너뛴다.
const ORDER_BY = new Map<string, Prisma.SROrderByWithRelationInput>([
  ['createdAt', DEFAULT_ORDER_BY],
  ['updatedAt', { updatedAt: 'desc' }],
  ['status', { status: 'asc' }],
]);

const VALID_STATUSES = new Set<string>(Object.values(SRStatus));

// GET /api/srs/my-requests - 내가 요청한 SR 목록 조회 (페이지네이션)
// ?page=1&pageSize=20&status=REQUESTED&sortBy=createdAt
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    const { searchParams } = new URL(request.url);
    // page / pageSize 파싱과 상한(MAX_PAGE_SIZE=100)은 공용 헬퍼가 담당한다.
    const { skip, take, createResponse } = usePagination(request);

    const status = searchParams.get('status');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const orderBy = ORDER_BY.get(sortBy) ?? DEFAULT_ORDER_BY;

    const where: Prisma.SRWhereInput = {
      requesterId: session.user.id,
    };

    // 상태 필터링. 알 수 없는 값은 필터 없음으로 취급한다(Prisma 런타임 오류 방지).
    if (status && status !== 'all' && VALID_STATUSES.has(status)) {
      where.status = status as SRStatus;
    }

    const [srs, totalCount, statusGroups] = await Promise.all([
      prisma.sR.findMany({
        where,
        orderBy,
        skip,
        take,
        // description(무제한 TEXT)은 목록에서 제외한다. 상세 라우트가 반환한다.
        select: {
          id: true,
          srNumber: true,
          title: true,
          status: true,
          requestedPriority: true,
          actualPriority: true,
          requestedCompletionDate: true,
          estimatedCompletionDate: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
          intakeAt: true,
          completedAt: true,
          client: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          serviceCategory: {
            select: {
              id: true,
              categoryName: true,
              slaHours: true,
              priority: true,
            },
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          intakeBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              comments: true,
              attachments: true,
            },
          },
        },
      }),
      prisma.sR.count({ where }),
      // 통계 카드는 현재 페이지가 아니라 요청자의 전체 SR 을 기준으로 한다.
      // (상태 필터를 걸었다고 "완료 0건"으로 보이면 안 된다)
      prisma.sR.groupBy({
        by: ['status'],
        where: { requesterId: session.user.id },
        _count: { _all: true },
      }),
    ]);

    const countByStatus = new Map(statusGroups.map((g) => [g.status, g._count._all]));
    const countOf = (...statuses: SRStatus[]) =>
      statuses.reduce((sum, s) => sum + (countByStatus.get(s) ?? 0), 0);

    const stats = {
      total: Array.from(countByStatus.values()).reduce((sum, n) => sum + n, 0),
      requested: countOf(SRStatus.REQUESTED),
      inProgress: countOf(SRStatus.IN_PROGRESS),
      completed: countOf(SRStatus.COMPLETED, SRStatus.CONFIRMED),
    };

    const now = Date.now();

    // 각 SR에 대해 추가 정보 계산
    const srsWithExtras = srs.map((sr) => {
      let waitingMinutes = 0;
      let waitingHours = 0;
      if (sr.status === 'REQUESTED') {
        waitingMinutes = Math.floor((now - new Date(sr.createdAt).getTime()) / (1000 * 60));
        waitingHours = waitingMinutes / 60;
      }

      let progressPercentage = 0;
      switch (sr.status) {
        case 'REQUESTED':
          progressPercentage = 10;
          break;
        case 'INTAKE':
          progressPercentage = 25;
          break;
        case 'IN_PROGRESS':
          progressPercentage = 50;
          break;
        case 'COMPLETED':
        case 'CONFIRMED':
          progressPercentage = 100;
          break;
        case 'REJECTED':
          progressPercentage = 0;
          break;
        default:
          progressPercentage = 10;
      }

      return {
        ...sr,
        waitingMinutes,
        waitingHours,
        progressPercentage,
      };
    });

    return NextResponse.json(
      serializeResponse({
        ...createResponse(srsWithExtras, totalCount),
        stats,
      })
    );
  },
  { preset: 'relaxed' }
);
