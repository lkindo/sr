import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { PAGINATION, STATS } from '@/lib/constants';
import prisma from '@/lib/prisma';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/dashboard/stats - 대시보드 통계 조회 (Rate Limit: 느슨함)
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    const url = new URL(request.url);
    const noCache = url.searchParams.get('nocache') === '1';
    const userId = session.user.id;
    const userRoles = session.user.roles || [];
    const isAdminManagerEngineer = userRoles.some((role: string) =>
      ['ADMIN', 'MANAGER', 'ENGINEER'].includes(role)
    );
    const isEngineer = userRoles.includes('ENGINEER');

    // 사용자별 캐시 키 생성 (역할별로 다른 데이터 표시)
    const baseCacheKey = `dashboard:stats:${userId}:${isAdminManagerEngineer ? 'admin' : 'client'}`;
    // nocache=1 이면 캐시 미스 유도(새 키)로 실시간 계산 강제
    const _cacheKey = noCache ? `${baseCacheKey}:nocache:${Date.now()}` : baseCacheKey;

    // 캐시된 통계 데이터 조회 또는 생성
    const stats = await (async () => {
      // 역할별 필터링 조건 설정
      const baseWhere: Prisma.SRWhereInput = {};
      let userClientIds: string[] = [];

      if (!isAdminManagerEngineer) {
        // 고객사 사용자는 자신의 고객사 SR만 조회
        const userClients = await prisma.userClient.findMany({
          where: { userId },
          select: { clientId: true },
        });
        userClientIds = userClients.map((uc) => uc.clientId);
        if (userClientIds.length > 0) {
          baseWhere.clientId = { in: userClientIds };
        } else {
          baseWhere.clientId = { in: [] }; // 고객사가 없으면 빈 결과
        }
      }

      // Get SR trend (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - STATS.TREND_DAYS);

      // Parallelize independent queries
      const [
        srByStatus,
        srByPriority,
        // countsResult removed (optimization)
        srByClient,
        recentSRs,
        waitingSRs,
        myAssignedSRsListRaw,
        srTrendRaw,
        performanceStatsRaw,
        myAssignedCount,        // Added for optimization (Engineer only)
        myAssignedInProgressCount // Added for optimization (Engineer only)
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
        // 3. Removed heavy aggregation query

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
          SELECT DATE(created_at) as date, COUNT(id) as count
          FROM srs
          WHERE created_at >= ${thirtyDaysAgo}
          ${
            !isAdminManagerEngineer
              ? userClientIds.length > 0
                ? Prisma.sql`AND client_id IN (${Prisma.join(userClientIds)})`
                : Prisma.sql`AND 1=0`
              : Prisma.empty
          }
          GROUP BY DATE(created_at)
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
        // 10. Optimized "My Assigned" counts (Engineer only)
        isEngineer
          ? prisma.sR.count({ where: { ...baseWhere, assigneeId: userId } })
          : Promise.resolve(0),
        // 11. Optimized "My Assigned In Progress" counts (Engineer only)
        isEngineer
          ? prisma.sR.count({ where: { ...baseWhere, assigneeId: userId, status: 'IN_PROGRESS' } })
          : Promise.resolve(0)
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

      // In-memory derivation of summary counts (Optimized from DB aggregation)
      const totalSRs = Object.values(statusCounts).reduce((a, b) => a + b, 0);
      const inProgressSRs = statusCounts['IN_PROGRESS'] || 0;
      const completedSRs = (statusCounts['COMPLETED'] || 0) + (statusCounts['CONFIRMED'] || 0);
      const pendingSRs = (statusCounts['REQUESTED'] || 0) + (statusCounts['INTAKE'] || 0);
      const requestedSRs = statusCounts['REQUESTED'] || 0;
      const urgentSRs = (priorityCounts['CRITICAL'] || 0) + (priorityCounts['HIGH'] || 0);

      const myAssignedSRs = myAssignedCount;
      const myAssignedInProgress = myAssignedInProgressCount;


      // Get client details (Requires srByClient)
      const clientIds = srByClient.map((item) => item.clientId);
      const clients = await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, name: true, code: true },
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

      // Group by date (YYYY-MM-DD)
      const trendByDate = srTrendRaw.reduce(
        (acc, item) => {
          // item.date can be Date object (Postgres) or string (other drivers)
          const dateStr =
            item.date instanceof Date ? item.date.toISOString().split('T')[0] : String(item.date);
          acc[dateStr] = Number(item.count);
          return acc;
        },
        {} as Record<string, number>
      );

      // Fill in missing dates
      const trendData = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
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
          noCache,
        });
      }
    } catch {
      // noop
    }

    return NextResponse.json(stats);
  },
  { preset: 'relaxed' }
); // 1분당 300회 (대시보드는 자주 조회됨)
