import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { getCachedData, CacheKeys } from "@/lib/redis-cache";
import { getDashboardTtlSeconds } from "@/lib/cache-config";
import { Prisma } from "@prisma/client";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/dashboard/stats - 대시보드 통계 조회 (Rate Limit: 느슨함)
export const GET = withAuthAndRateLimit(async (request: NextRequest, { session }) => {
  const url = new URL(request.url);
  const noCache = url.searchParams.get('nocache') === '1';
  const userId = session.user.id;
  const userRoles = session.user.roles || [];
  const isAdminManagerEngineer = userRoles.some((role: string) => 
    ["ADMIN", "MANAGER", "ENGINEER"].includes(role)
  );
  const isEngineer = userRoles.includes("ENGINEER");
  
  // 사용자별 캐시 키 생성 (역할별로 다른 데이터 표시)
  const baseCacheKey = `${CacheKeys.dashboardStats()}:${userId}:${isAdminManagerEngineer ? 'admin' : 'client'}`;
  // nocache=1 이면 캐시 미스 유도(새 키)로 실시간 계산 강제
  const cacheKey = noCache ? `${baseCacheKey}:nocache:${Date.now()}` : baseCacheKey;
  
  // 캐시된 통계 데이터 조회 또는 생성
  const stats = await getCachedData(
    cacheKey,
    async () => {
      // 역할별 필터링 조건 설정
      let baseWhere: Prisma.SRWhereInput = {};
      if (!isAdminManagerEngineer) {
        // 고객사 사용자는 자신의 고객사 SR만 조회
        const userClients = await prisma.userClient.findMany({
          where: { userId },
          select: { clientId: true },
        });
        const userClientIds = userClients.map((uc) => uc.clientId);
        if (userClientIds.length > 0) {
          baseWhere.clientId = { in: userClientIds };
        } else {
          baseWhere.clientId = { in: [] }; // 고객사가 없으면 빈 결과
        }
      }

      // Get SR counts by status
      const srByStatus = await prisma.sR.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: {
          id: true,
        },
      });

      const statusCounts = srByStatus.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {} as Record<string, number>);

      // Get SR counts by priority
      const srByPriority = await prisma.sR.groupBy({
        by: ["priority"],
        where: baseWhere,
        _count: {
          id: true,
        },
      });

      const priorityCounts = srByPriority.reduce((acc, item) => {
        const key = item.priority ?? 'UNKNOWN';
        acc[key] = item._count.id;
        return acc;
      }, {} as Record<string, number>);

      // Get total counts
      const totalSRs = await prisma.sR.count({ where: baseWhere });
      const inProgressSRs = await prisma.sR.count({
        where: { ...baseWhere, status: "IN_PROGRESS" },
      });
      const completedSRs = await prisma.sR.count({
        where: { ...baseWhere, status: { in: ["COMPLETED", "CONFIRMED"] } },
      });
      const pendingSRs = await prisma.sR.count({
        where: { ...baseWhere, status: { in: ["REQUESTED", "INTAKE"] } },
      });
      const requestedSRs = await prisma.sR.count({
        where: { ...baseWhere, status: "REQUESTED" },
      });
      const urgentSRs = await prisma.sR.count({
        where: { ...baseWhere, priority: { in: ["CRITICAL", "HIGH"] } },
      });
      
      // 내 담당 SR 통계 (ENGINEER용)
      let myAssignedSRs = 0;
      let myAssignedInProgress = 0;
      if (isEngineer) {
        myAssignedSRs = await prisma.sR.count({
          where: { ...baseWhere, assigneeId: userId },
        });
        myAssignedInProgress = await prisma.sR.count({
          where: { ...baseWhere, assigneeId: userId, status: "IN_PROGRESS" },
        });
      }

      // Get SR counts by client
      const srByClient = await prisma.sR.groupBy({
        by: ["clientId"],
        where: baseWhere,
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: "desc",
          },
        },
        take: 10,
      });

    const clientIds = srByClient.map((item) => item.clientId);
    const clients = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, name: true, code: true },
    });

    const clientCounts = srByClient.map((item) => {
      const client = clients.find((c) => c.id === item.clientId);
      return {
        clientId: item.clientId,
        clientName: client?.name || "Unknown",
        clientCode: client?.code || "",
        count: item._count.id,
      };
    });

      // Get recent SRs
      const recentSRs = await prisma.sR.findMany({
        where: baseWhere,
        take: 10,
        orderBy: { createdAt: "desc" },
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
      });

      // 접수 대기 SR 목록 (REQUESTED 상태, 최대 5개)
      const waitingSRs = await prisma.sR.findMany({
        where: { ...baseWhere, status: "REQUESTED" },
        take: 5,
        orderBy: { createdAt: "asc" }, // 오래된 것부터
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
      });

      // 내 담당 SR 목록 (ENGINEER용, 최대 5개)
      let myAssignedSRsList: Prisma.SRGetPayload<{
        include: {
          client: { select: { name: true; code: true } };
          requester: { select: { name: true } };
          serviceCategory: { select: { categoryName: true } };
        };
      }>[] = [];
      if (isEngineer) {
        myAssignedSRsList = await prisma.sR.findMany({
          where: { ...baseWhere, assigneeId: userId },
          take: 5,
          orderBy: { dueDate: "asc" }, // 마감일이 가까운 것부터
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
        });
      }

      // Get SR trend (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const srTrend = await prisma.sR.groupBy({
        by: ["createdAt"],
        where: {
          ...baseWhere,
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
        _count: {
          id: true,
        },
      });

      // 성능 지표 계산
      const completedSRsWithDates = await prisma.sR.findMany({
        where: {
          ...baseWhere,
          status: { in: ["COMPLETED", "CONFIRMED"] },
          intakeAt: { not: null },
          completedAt: { not: null },
        },
        select: {
          intakeAt: true,
          completedAt: true,
          dueDate: true,
          serviceCategory: {
            select: {
              slaHours: true,
            },
          },
        },
      });

      // 평균 처리 시간 계산 (접수부터 완료까지)
      let avgProcessingHours = 0;
      if (completedSRsWithDates.length > 0) {
        const totalHours = completedSRsWithDates.reduce((sum, sr) => {
          if (sr.intakeAt && sr.completedAt) {
            const hours = (sr.completedAt.getTime() - sr.intakeAt.getTime()) / (1000 * 60 * 60);
            return sum + hours;
          }
          return sum;
        }, 0);
        avgProcessingHours = totalHours / completedSRsWithDates.length;
      }

      // SLA 준수율 계산
      let slaComplianceRate = 0;
      if (completedSRsWithDates.length > 0) {
        const compliantCount = completedSRsWithDates.filter((sr) => {
          if (!sr.dueDate || !sr.completedAt) return false;
          return sr.completedAt <= sr.dueDate;
        }).length;
        slaComplianceRate = (compliantCount / completedSRsWithDates.length) * 100;
      }

      // 접수 대기 시간 통계
      const waitingTimes = waitingSRs.map((sr) => {
        const now = new Date();
        const requestedAt = new Date(sr.createdAt);
        return (now.getTime() - requestedAt.getTime()) / (1000 * 60 * 60); // 시간 단위
      });
      const avgWaitingHours = waitingTimes.length > 0
        ? waitingTimes.reduce((sum, hours) => sum + hours, 0) / waitingTimes.length
        : 0;

    // Group by date (YYYY-MM-DD)
    const trendByDate = srTrend.reduce((acc, item) => {
      const date = item.createdAt.toISOString().split("T")[0];
      acc[date] = (acc[date] || 0) + item._count.id;
      return acc;
    }, {} as Record<string, number>);

      // Fill in missing dates
      const trendData = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
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
    },
    getDashboardTtlSeconds() // 캐시 TTL (env로 조정)
  );

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
}, { preset: 'relaxed' }); // 1분당 300회 (대시보드는 자주 조회됨)
