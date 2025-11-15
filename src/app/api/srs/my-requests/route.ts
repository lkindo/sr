import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/srs/my-requests - 내가 요청한 SR 목록 조회
export async function GET(request: NextRequest) {
  console.log("🔍 [GET /api/srs/my-requests] 요청 시작");

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // 상태 필터 (all, REQUESTED, IN_PROGRESS, COMPLETED, etc.)
    const sortBy = searchParams.get("sortBy") || "createdAt"; // 정렬 기준 (createdAt, updatedAt, status)

    // 조회 조건 구성
    const where: Prisma.SRWhereInput = {
      requesterId: session.user.id, // 내가 요청한 SR만
    };

    // 상태 필터링
    if (status && status !== "all") {
      where.status = status as "REQUESTED" | "INTAKE" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CONFIRMED" | "REJECTED";
    }

    // 정렬 조건 구성
    let orderBy: Prisma.SROrderByWithRelationInput;
    switch (sortBy) {
      case "updatedAt":
        orderBy = { updatedAt: "desc" };
        break;
      case "status":
        orderBy = { status: "asc" };
        break;
      case "createdAt":
      default:
        orderBy = { createdAt: "desc" };
        break;
    }

    // 필요한 필드만 선택하여 SR 목록 조회
    const srs = await prisma.sR.findMany({
      where,
      orderBy,
      select: {
        id: true,
        srNumber: true,
        title: true,
        description: true,
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
          }
        },
        serviceCategory: {
          select: {
            id: true,
            categoryName: true,
            slaHours: true,
            priority: true,
          }
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        intakeBy: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        // 별도 쿼리로 처리할 count 정보
      }
    });

    // 별도로 각 SR에 대한 카운트 정보 조회
    const srIds = srs.map(sr => sr.id);
    const counts = await prisma.sRComment.groupBy({
      by: ['srId'],
      where: {
        srId: { in: srIds }
      },
      _count: {
        _all: true
      }
    });
    
    const attachmentCounts = await prisma.sRAttachment.groupBy({
      by: ['srId'],
      where: {
        srId: { in: srIds }
      },
      _count: {
        _all: true
      }
    });
    
    // 카운트 정보 매핑
    const commentCountsMap: Record<string, number> = {};
    const attachmentCountsMap: Record<string, number> = {};
    
    counts.forEach(count => {
      commentCountsMap[count.srId] = count._count._all;
    });
    
    attachmentCounts.forEach(count => {
      attachmentCountsMap[count.srId] = count._count._all;
    });
    
    // 각 SR에 카운트 정보 추가
    const srsWithCounts = srs.map(sr => ({
      ...sr,
      _count: {
        comments: commentCountsMap[sr.id] || 0,
        attachments: attachmentCountsMap[sr.id] || 0,
      }
    }));

    // 각 SR에 대해 추가 정보 계산
    const srsWithExtras = srsWithCounts.map((sr) => {
      // 대기 시간 계산 (REQUESTED 상태인 경우)
      let waitingMinutes = 0;
      let waitingHours = 0;
      if (sr.status === "REQUESTED") {
        const now = new Date();
        const requestedAt = new Date(sr.createdAt);
        waitingMinutes = Math.floor((now.getTime() - requestedAt.getTime()) / (1000 * 60));
        waitingHours = waitingMinutes / 60;
      }

      // 진행률 계산 (간단한 예시)
      let progressPercentage = 0;
      switch (sr.status) {
        case "REQUESTED":
          progressPercentage = 10;
          break;
        case "IN_PROGRESS":
          progressPercentage = 50;
          break;
        case "COMPLETED":
        case "CONFIRMED":
          progressPercentage = 100;
          break;
        case "REJECTED":
          progressPercentage = 0;
          break;
      }

      return {
        ...sr,
        waitingMinutes,
        waitingHours,
        progressPercentage,
      };
    });

    console.log(`✅ [GET /api/srs/my-requests] ${srsWithExtras.length}개 SR 조회 완료`);

    return NextResponse.json({
      srs: srsWithExtras,
      total: srsWithExtras.length,
    }, { status: 200 });

  } catch (error) {
    console.error("❌ [GET /api/srs/my-requests] 오류:", error);
    return NextResponse.json(
      {
        error: "요청 목록 조회 중 오류가 발생했습니다",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}
