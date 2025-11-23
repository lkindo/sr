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
  console.log("[DEBUG] [GET /api/srs/my-requests] 요청 시작");

  try {
    const session = await auth();
    if (!session?.user?.id) {
      console.log("[DEBUG] No session found");
      return NextResponse.json(
        { error: "인증이 필요합니다" },
        { status: 401 }
      );
    }

    console.log(`[DEBUG] User ID: ${session.user.id}`);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const sortBy = searchParams.get("sortBy") || "createdAt";

    // 조회 조건 구성
    const where: Prisma.SRWhereInput = {
      requesterId: session.user.id,
    };

    // 상태 필터링
    if (status && status !== "all") {
      where.status = status as any;
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

    console.log(`[DEBUG] Querying database with where:`, where);

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
        _count: {
          select: {
            comments: true,
            attachments: true,
          }
        }
      }
    });

    console.log(`[DEBUG] Retrieved ${srs.length} SRs from database`);

    // 각 SR에 대해 추가 정보 계산
    const srsWithExtras = srs.map((sr) => {
      let waitingMinutes = 0;
      let waitingHours = 0;
      if (sr.status === "REQUESTED") {
        const now = new Date();
        const requestedAt = new Date(sr.createdAt);
        waitingMinutes = Math.floor((now.getTime() - requestedAt.getTime()) / (1000 * 60));
        waitingHours = waitingMinutes / 60;
      }

      let progressPercentage = 0;
      switch (sr.status) {
        case "REQUESTED":
          progressPercentage = 10;
          break;
        case "INTAKE":
          progressPercentage = 25;
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

    console.log(`[DEBUG] Returning ${srsWithExtras.length} SRs`);

    return NextResponse.json({
      srs: srsWithExtras,
      total: srsWithExtras.length,
    }, { status: 200 });

  } catch (error) {
    console.error("[ERROR] [GET /api/srs/my-requests] 오류:", error);
    console.error("[ERROR] Stack:", error instanceof Error ? error.stack : "No stack");
    return NextResponse.json(
      {
        error: "요청 목록 조회 중 오류가 발생했습니다",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}
