import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Force Node.js runtime
export const runtime = 'nodejs';

export async function GET() {
  try {
    console.log("🔍 [TEST] Prisma 호출 시작");
    const srs = await prisma.sR.findMany({
      take: 5
    });
    console.log("✅ [TEST] Prisma 호출 성공, SR 개수:", srs.length);
    
    return NextResponse.json({
      success: true,
      count: srs.length,
      srs: srs
    });
  } catch (error) {
    console.error("❌ [TEST] 에러:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

