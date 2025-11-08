import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Force Node.js runtime
export const runtime = 'nodejs';

// GET /api/health - 데이터베이스 연결 상태 확인
export async function GET() {
  try {
    // Prisma로 간단한 쿼리 실행하여 연결 테스트
    const result = await prisma.$queryRaw`SELECT 1 as connected`;

    // 현재 시간도 가져와서 DB 시간 확인
    const dbTime = await prisma.$queryRaw`SELECT NOW() as server_time`;

    return NextResponse.json({
      status: "healthy",
      database: {
        connected: true,
        result: result,
        serverTime: dbTime,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    return NextResponse.json(
      {
        status: "unhealthy",
        database: {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
