import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// GET /api/dashboard/stats - 대시보드 통계 조회
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
        assignedTo: {
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

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return NextResponse.json(
      { error: "대시보드 통계를 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
