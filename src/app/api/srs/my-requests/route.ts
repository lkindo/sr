import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/srs/my-requests - 내가 요청한 SR 목록 조회
export async function GET(request: NextRequest) {
  console.log("🔍 [GET /api/srs/my-requests] 요청 시작");

  try {
    // 임시: admin 사용자 조회
    const adminUser = await prisma.user.findFirst({
      where: { email: "admin@example.com" }
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 500 }
      );
    }

    const session = { user: { id: adminUser.id, email: adminUser.email } } as any;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // 상태 필터 (all, REQUESTED, IN_PROGRESS, COMPLETED, etc.)
    const sortBy = searchParams.get("sortBy") || "createdAt"; // 정렬 기준 (createdAt, updatedAt, status)

    // 조회 조건 구성
    const where: any = {
      requesterId: session.user.id, // 내가 요청한 SR만
    };

    // 상태 필터링
    if (status && status !== "all") {
      where.status = status;
    }

    // 정렬 조건 구성
    let orderBy: any = {};
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

    // SR 목록 조회
    const srs = await prisma.sR.findMany({
      where,
      orderBy,
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

    // 각 SR에 대해 추가 정보 계산
    const srsWithExtras = srs.map((sr) => {
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
