import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

/**
 * 공개 API: 활성 고객사 목록 조회 (회원가입용)
 * 인증 불필요 - 회원가입 시 고객사 선택을 위한 공개 API
 */
export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      where: {
        isActive: true, // 활성 고객사만
      },
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(clients);
  } catch (error) {
    console.error("공개 고객사 목록 조회 오류:", error);
    return NextResponse.json(
      { error: "고객사 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
