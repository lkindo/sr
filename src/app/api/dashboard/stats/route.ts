import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { PAGINATION, STATS } from '@/lib/constants';
import { INTERNAL_ROLES, resolveAssigneeScope } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { CLIENT_SUMMARY_SELECT } from '@/lib/prisma-selects';
import { formatISODateInAppZone } from '@/lib/timezone';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/dashboard/stats - 대시보드 통계 조회 (Rate Limit: 느슨함)
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    const userId = session.user.id;
    const userRoles = session.user.roles || [];
    const isAdminManagerEngineer = userRoles.some((role: string) => INTERNAL_ROLES.includes(role));
    const isEngineer = userRoles.includes('ENGINEER');

    /**
     * 이 응답은 캐시하지 않는다 — 매 요청마다 계산한다.
     *
     * 예전에는 `baseCacheKey` / `cacheKey` / `?nocache=1` 를 계산해 두고 **한 번도 읽지
     * 않았다**. 주석은 캐싱을 한다고 적혀 있고(중복까지 되어 있었다) 실제 본문은 평범한
     * async IIFE 였다. 존재하지 않는 통제를 코드가 주장하고 있었으므로 지웠다(감사 4.5).
     *
     * 캐시를 붙이지 않은 이유: 이 엔드포인트는 SSE 무효화로 실시간 갱신되는 대시보드가
     * 소비한다. 서버에 TTL 캐시를 두면 사용자가 SR 을 바꾼 직후 재조회해도 옛 수치를
     * 보게 되어, 실시간 갱신을 다시 깨뜨린다. `?nocache=1` 탈출구도 호출하는 곳이 없다
     * (src 전역 grep 0건). 비용이 문제가 되면 스테일 응답이 아니라 집계 쿼리 자체를
     * 손봐야 한다.
     */
    const stats = await (async () => {
      // 역할별 필터링 조건 설정
      const baseWhere: Prisma.SRWhereInput = {};
      let userClientIds: string[] = [];

      if (!isAdminManagerEngineer) {
        // 고객사 사용자는 자신의 고객사 SR만 조회
        // Optimized: Use clientIds from session instead of DB query
        userClientIds = session.user.clientIds || [];
        if (userClientIds.length > 0) {
          baseWhere.clientId = { in: userClientIds };
        } else {
          baseWhere.clientId = { in: [] }; // 고객사가 없으면 빈 결과
        }
      }

      // 담당자 스코프 — ENGINEER 는 배정된 SR 만 본다(canReadSR 과 같은 규칙,
      // src/lib/policies.ts 의 resolveAssigneeScope). 이게 없으면 대시보드의 recentSRs 가
      // ENGINEER 가 열 수 없는(상세 403) SR 의 **제목과 링크**를 노출한다.
      // 집계 수치도 마찬가지로 자기 SR 기준이 된다 — '내 담당 SR' 카드와 같은 관점이다.
      const assigneeScope = resolveAssigneeScope(session.user);
      if (assigneeScope) {
        baseWhere.assigneeId = assigneeScope;
      }

      // Get SR trend (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - STATS.TREND_DAYS);

      // Parallelize independent queries
      const [
        srByStatus,
        srByPriority,
        countsResult,
        srByClient,
        recentSRs,
        waitingSRs,
        myAssignedSRsListRaw,
        srTrendRaw,
        performanceStatsRaw,
      ] = await Promise.all([
        // 1. Get SR counts by status
        prisma.sR.groupBy({
          by: ['status'],
          where: baseWhere,
          _count: {
            id: true,
          },
        }),
        // 2. Get SR counts by priority
        prisma.sR.groupBy({
          by: ['priority'],
          where: baseWhere,
          _count: {
            id: true,
          },
        }),
        // 3. Get total counts - optimized with single query using conditional aggregation
        prisma.$queryRaw<
          Array<{
            totalSRs: bigint;
            inProgressSRs: bigint;
            completedSRs: bigint;
            pendingSRs: bigint;
            requestedSRs: bigint;
            urgentSRs: bigint;
            myAssignedSRs: bigint;
            myAssignedInProgress: bigint;
          }>
        >`
          SELECT
            COUNT(*)::int as "totalSRs",
            COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int as "inProgressSRs",
            COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'CONFIRMED'))::int as "completedSRs",
            COUNT(*) FILTER (WHERE status IN ('REQUESTED', 'INTAKE'))::int as "pendingSRs",
            COUNT(*) FILTER (WHERE status = 'REQUESTED')::int as "requestedSRs",
            COUNT(*) FILTER (WHERE priority IN ('CRITICAL', 'HIGH'))::int as "urgentSRs",
            ${
              isEngineer
                ? Prisma.sql`COUNT(*) FILTER (WHERE assignee_id = ${userId})::int as "myAssignedSRs",`
                : Prisma.sql`0 as "myAssignedSRs",`
            }
            ${
              isEngineer
                ? Prisma.sql`COUNT(*) FILTER (WHERE assignee_id = ${userId} AND status = 'IN_PROGRESS')::int as "myAssignedInProgress"`
                : Prisma.sql`0 as "myAssignedInProgress"`
            }
          FROM "srs"
          WHERE 1=1
          ${
            !isAdminManagerEngineer
              ? userClientIds.length > 0
                ? Prisma.sql`AND client_id IN (${Prisma.join(userClientIds)})`
                : Prisma.sql`AND 1=0`
              : Prisma.empty
          }
        `,
        // 4. Get SR counts by client
        prisma.sR.groupBy({
          by: ['clientId'],
          where: baseWhere,
          _count: {
            id: true,
          },
          orderBy: {
            _count: {
              id: 'desc',
            },
          },
          take: PAGINATION.DASHBOARD_TOP_CLIENTS,
        }),
        // 5. Get recent SRs
        prisma.sR.findMany({
          where: baseWhere,
          take: PAGINATION.DASHBOARD_RECENT_SRS,
          orderBy: { createdAt: 'desc' },
          include: {
            client: {
              select: {
                name: true,
                code: true,
              },
            },
            requester: {
              select: {
                name: true,
              },
            },
            assignee: {
              select: {
                name: true,
              },
            },
          },
        }),
        // 6. 접수 대기 SR 목록 (REQUESTED 상태, 최대 5개)
        prisma.sR.findMany({
          where: { ...baseWhere, status: 'REQUESTED' },
          take: PAGINATION.DASHBOARD_WAITING_SRS,
          orderBy: { createdAt: 'asc' }, // 오래된 것부터
          include: {
            client: {
              select: {
                name: true,
                code: true,
              },
            },
            requester: {
              select: {
                name: true,
              },
            },
            serviceCategory: {
              select: {
                categoryName: true,
                priority: true,
              },
            },
          },
        }),
        // 7. 내 담당 SR 목록 (ENGINEER용, 최대 5개)
        isEngineer
          ? prisma.sR.findMany({
              where: { ...baseWhere, assigneeId: userId },
              take: PAGINATION.DASHBOARD_MY_ASSIGNED,
              orderBy: { dueDate: 'asc' }, // 마감일이 가까운 것부터
              include: {
                client: {
                  select: {
                    name: true,
                    code: true,
                  },
                },
                requester: {
                  select: {
                    name: true,
                  },
                },
                serviceCategory: {
                  select: {
                    categoryName: true,
                  },
                },
              },
            })
          : Promise.resolve([]),
        // 8. Get SR trend (last 30 days) - Optimized: Group by date in DB using raw SQL
        prisma.$queryRaw<Array<{ date: Date | string; count: bigint }>>`
          SELECT DATE(created_at AT TIME ZONE 'Asia/Seoul') as date, COUNT(id) as count
          FROM srs
          WHERE created_at >= ${thirtyDaysAgo}
          ${
            !isAdminManagerEngineer
              ? userClientIds.length > 0
                ? Prisma.sql`AND client_id IN (${Prisma.join(userClientIds)})`
                : Prisma.sql`AND 1=0`
              : Prisma.empty
          }
          GROUP BY DATE(created_at AT TIME ZONE 'Asia/Seoul')
        `,
        // 9. 성능 지표 계산 - DB Aggregation
        prisma.$queryRaw<
          Array<{ avgProcessingHours: number | null; slaComplianceRate: number | null }>
        >`
          SELECT
            AVG(EXTRACT(EPOCH FROM (completed_at - intake_at)) / 3600)::float as "avgProcessingHours",
            COUNT(*) FILTER (WHERE completed_at <= due_date)::float * 100.0 / NULLIF(COUNT(*), 0) as "slaComplianceRate"
          FROM "srs"
          WHERE
            status IN ('COMPLETED', 'CONFIRMED')
            AND intake_at IS NOT NULL
            AND completed_at IS NOT NULL
            AND created_at >= ${thirtyDaysAgo}
            ${
              !isAdminManagerEngineer
                ? userClientIds.length > 0
                  ? Prisma.sql`AND client_id IN (${Prisma.join(userClientIds)})`
                  : Prisma.sql`AND 1=0`
                : Prisma.empty
            }
        `,
      ]);

      const myAssignedSRsList = myAssignedSRsListRaw as Prisma.SRGetPayload<{
        include: {
          client: { select: { name: true; code: true } };
          requester: { select: { name: true } };
          serviceCategory: { select: { categoryName: true } };
        };
      }>[];

      const statusCounts = srByStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count.id;
          return acc;
        },
        {} as Record<string, number>
      );

      const priorityCounts = srByPriority.reduce(
        (acc, item) => {
          const key = item.priority ?? 'UNKNOWN';
          acc[key] = item._count.id;
          return acc;
        },
        {} as Record<string, number>
      );

      // Helper to safely convert BigInt or number to number
      const toNum = (val: bigint | number | null | undefined) => Number(val ?? 0);

      const counts = countsResult[0] || {
        totalSRs: 0,
        inProgressSRs: 0,
        completedSRs: 0,
        pendingSRs: 0,
        requestedSRs: 0,
        urgentSRs: 0,
        myAssignedSRs: 0,
        myAssignedInProgress: 0,
      };

      const totalSRs = toNum(counts.totalSRs);
      const inProgressSRs = toNum(counts.inProgressSRs);
      const completedSRs = toNum(counts.completedSRs);
      const pendingSRs = toNum(counts.pendingSRs);
      const requestedSRs = toNum(counts.requestedSRs);
      const urgentSRs = toNum(counts.urgentSRs);
      const myAssignedSRs = toNum(counts.myAssignedSRs);
      const myAssignedInProgress = toNum(counts.myAssignedInProgress);

      // Get client details (Requires srByClient)
      const clientIds = srByClient.map((item) => item.clientId);
      const clients = await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: CLIENT_SUMMARY_SELECT,
      });

      const clientMap = clients.reduce(
        (acc, client) => {
          acc[client.id] = client;
          return acc;
        },
        {} as Record<string, (typeof clients)[number]>
      );

      const clientCounts = srByClient.map((item) => {
        const client = clientMap[item.clientId];
        return {
          clientId: item.clientId,
          clientName: client?.name || 'Unknown',
          clientCode: client?.code || '',
          count: item._count.id,
        };
      });

      const performanceStats = performanceStatsRaw[0] || {
        avgProcessingHours: null,
        slaComplianceRate: null,
      };

      const avgProcessingHours = performanceStats.avgProcessingHours ?? 0;
      const slaComplianceRate = performanceStats.slaComplianceRate ?? 0;

      // 접수 대기 시간 통계
      const waitingTimes = waitingSRs.map((sr) => {
        const now = new Date();
        const requestedAt = new Date(sr.createdAt);
        return (now.getTime() - requestedAt.getTime()) / (1000 * 60 * 60); // 시간 단위
      });
      const avgWaitingHours =
        waitingTimes.length > 0
          ? waitingTimes.reduce((sum, hours) => sum + hours, 0) / waitingTimes.length
          : 0;

      // Group by date (YYYY-MM-DD, KST 달력 기준)
      //
      // SQL 이 `AT TIME ZONE 'Asia/Seoul'` 로 이미 KST 달력일을 돌려주므로, 여기서는
      // 그 값을 타임존 변환 없이 그대로 읽어야 한다. `toISOString()` 을 다시 태우면
      // 드라이버가 만든 Date(자정)가 UTC 로 되밀려 하루가 어긋난다.
      const trendByDate = srTrendRaw.reduce(
        (acc, item) => {
          // item.date can be Date object (Postgres) or string (other drivers)
          const dateStr =
            item.date instanceof Date
              ? `${item.date.getUTCFullYear()}-${String(item.date.getUTCMonth() + 1).padStart(2, '0')}-${String(item.date.getUTCDate()).padStart(2, '0')}`
              : String(item.date).slice(0, 10);
          acc[dateStr] = Number(item.count);
          return acc;
        },
        {} as Record<string, number>
      );

      // Fill in missing dates
      const trendData = [];
      for (let i = 29; i >= 0; i--) {
        // 채움 루프도 KST 달력일로 만들어야 GROUP BY 결과와 키가 맞는다.
        const dateStr = formatISODateInAppZone(Date.now() - i * 24 * 60 * 60 * 1000);
        trendData.push({
          date: dateStr,
          count: trendByDate[dateStr] || 0,
        });
      }

      return {
        summary: {
          total: totalSRs,
          inProgress: inProgressSRs,
          completed: completedSRs,
          pending: pendingSRs,
          requested: requestedSRs,
          urgent: urgentSRs,
          myAssigned: myAssignedSRs,
          myAssignedInProgress: myAssignedInProgress,
        },
        byStatus: statusCounts,
        byPriority: priorityCounts,
        byClient: clientCounts,
        recentSRs: recentSRs.map((sr) => ({
          ...sr,
          createdAt: sr.createdAt.toISOString(),
        })),
        waitingSRs: waitingSRs.map((sr) => ({
          id: sr.id,
          srNumber: sr.srNumber,
          title: sr.title,
          priority: sr.priority,
          requestedPriority: sr.requestedPriority,
          createdAt: sr.createdAt.toISOString(),
          client: sr.client,
          requester: sr.requester,
          serviceCategory: sr.serviceCategory,
        })),
        myAssignedSRs: myAssignedSRsList.map((sr) => ({
          id: sr.id,
          srNumber: sr.srNumber,
          title: sr.title,
          status: sr.status,
          priority: sr.priority,
          dueDate: sr.dueDate?.toISOString() || null,
          createdAt: sr.createdAt.toISOString(),
          client: sr.client,
          requester: sr.requester,
          serviceCategory: sr.serviceCategory,
        })),
        performance: {
          avgProcessingHours: Math.round(avgProcessingHours * 10) / 10,
          slaComplianceRate: Math.round(slaComplianceRate * 10) / 10,
          avgWaitingHours: Math.round(avgWaitingHours * 10) / 10,
        },
        trend: trendData,
      };
    })();

    // 개발환경 진단 로그
    try {
      if (process.env.NODE_ENV === 'development') {
        const { logger } = await import('@/lib/logger');
        logger.info('[Dashboard][Stats] response', {
          userId,
          roleScope: isAdminManagerEngineer ? 'admin' : 'client',
          byStatusKeys: Object.keys(stats?.byStatus ?? {}).length,
          byPriorityKeys: Object.keys(stats?.byPriority ?? {}).length,
        });
      }
    } catch {
      // noop
    }

    return NextResponse.json(stats);
  },
  { preset: 'relaxed' }
); // 1분당 300회 (대시보드는 자주 조회됨)
