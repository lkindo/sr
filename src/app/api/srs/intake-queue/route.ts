import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { Prisma } from "@prisma/client";

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/srs/intake-queue - 접수 대기 목록 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (request: NextRequest) => {
  console.log("🔍 [GET /api/srs/intake-queue] 요청 시작");

  const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const serviceCategoryId = searchParams.get("serviceCategoryId");
    const sortBy = searchParams.get("sortBy") || "waitingTime"; // waitingTime, priority, requestedCompletionDate

    // WHERE 조건
    const where: Prisma.SRWhereInput = {
      status: "REQUESTED", // 접수 대기 중인 SR만
    };

    if (clientId && clientId !== "all") {
      where.clientId = clientId;
    }

    if (serviceCategoryId && serviceCategoryId !== "all") {
      where.serviceCategoryId = serviceCategoryId;
    }

    // SR 조회
    const srs = await prisma.sR.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          }
        },
        serviceCategory: {
          select: {
            id: true,
            categoryName: true,
            slaHours: true,
            priority: true,
            handlerId: true,
            handler: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          }
        }
      },
      orderBy: {
        createdAt: "asc", // 기본: 오래된 것부터
      }
    });

    // 대기 시간 및 우선순위 점수 계산
    const now = new Date();
    const enrichedSrs = srs.map(sr => {
      const waitingMinutes = Math.floor((now.getTime() - new Date(sr.requestedAt).getTime()) / (1000 * 60));
      const waitingHours = (waitingMinutes / 60).toFixed(1);

      // 우선순위 점수 계산
      let priorityScore = 0;

      // 1. 대기 시간 (최대 100점)
      priorityScore += Math.min(waitingMinutes / 60, 100);

      // 2. 요청자 희망 우선순위 (최대 50점)
      const requestedPriorityScore: Record<string, number> = {
        CRITICAL: 50,
        HIGH: 35,
        MEDIUM: 20,
        LOW: 10
      };
      priorityScore += requestedPriorityScore[sr.requestedPriority] || 20;

      // 3. ServiceCategory 기본 우선순위 (최대 30점)
      const categoryPriorityScore: Record<string, number> = {
        CRITICAL: 30,
        HIGH: 20,
        MEDIUM: 10,
        LOW: 5
      };
      priorityScore += categoryPriorityScore[sr.serviceCategory.priority] || 10;

      return {
        ...sr,
        waitingMinutes,
        waitingHours: parseFloat(waitingHours),
        priorityScore: Math.round(priorityScore),
        // 추천 담당자 (ServiceCategory의 handler)
        recommendedAssignee: sr.serviceCategory.handler,
        // SLA 정보
        slaHours: sr.serviceCategory.slaHours,
      };
    });

    // 정렬
    let sortedSrs = enrichedSrs;

    switch (sortBy) {
      case "waitingTime":
        sortedSrs.sort((a, b) => b.waitingMinutes - a.waitingMinutes);
        break;
      case "priority":
        sortedSrs.sort((a, b) => {
          // 1차: priorityScore
          if (b.priorityScore !== a.priorityScore) {
            return b.priorityScore - a.priorityScore;
          }
          // 2차: 대기 시간
          return b.waitingMinutes - a.waitingMinutes;
        });
        break;
      case "requestedCompletionDate":
        sortedSrs.sort((a, b) => {
          if (!a.requestedCompletionDate) return 1;
          if (!b.requestedCompletionDate) return -1;
          return new Date(a.requestedCompletionDate).getTime() - new Date(b.requestedCompletionDate).getTime();
        });
        break;
      default:
        // priorityScore 기본 정렬
        sortedSrs.sort((a, b) => b.priorityScore - a.priorityScore);
    }

  console.log(`✅ 접수 대기 SR ${sortedSrs.length}건 조회 완료`);

  return NextResponse.json({
    srs: sortedSrs,
    total: sortedSrs.length,
    timestamp: now.toISOString(),
  });
}, { preset: 'standard' }); // 1분당 100회
