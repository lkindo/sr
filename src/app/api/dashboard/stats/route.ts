import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { getCachedData, CacheKeys } from "@/lib/redis-cache";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/dashboard/stats - 대시보드 통계 조회 (Rate Limit: 느슨함)
export const GET = withAuthAndRateLimit(async (request: NextRequest) => {
  // 캐시된 통계 데이터 조회 또는 생성
  const stats = await getCachedData(
    CacheKeys.dashboardStats(),
    async () => {
      // Get SR counts by status
      const srByStatus = await prisma.sR.groupBy({
    by: ["status"],
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
      _count: {
        id: true,
      },
    });

    const priorityCounts = srByPriority.reduce((acc, item) => {
      acc[item.priority] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    // Get total counts
    const totalSRs = await prisma.sR.count();
    const inProgressSRs = await prisma.sR.count({
      where: { status: "IN_PROGRESS" },
    });
    const completedSRs = await prisma.sR.count({
      where: { status: { in: ["COMPLETED", "CONFIRMED"] } },
    });
    const pendingSRs = await prisma.sR.count({
      where: { status: { in: ["REQUESTED", "INTAKE"] } },
    });

    // Get SR counts by client
    const srByClient = await prisma.sR.groupBy({
      by: ["clientId"],
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

    // Get SR trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const srTrend = await prisma.sR.groupBy({
      by: ["createdAt"],
      where: {
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
      _count: {
        id: true,
      },
    });

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
        },
        byStatus: statusCounts,
        byPriority: priorityCounts,
        byClient: clientCounts,
        recentSRs: recentSRs,
        trend: trendData,
      };
    },
    300 // 5분 캐시
  );

  return NextResponse.json(stats);
}, { preset: 'relaxed' }); // 1분당 300회 (대시보드는 자주 조회됨)
