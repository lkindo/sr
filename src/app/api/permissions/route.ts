import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";


// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';
// GET /api/permissions - 모든 권한 조회
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permissions = await prisma.permission.findMany({
      orderBy: {
        resource: "asc",
      },
    });

    return NextResponse.json(permissions);
  } catch (error) {
    console.error("Error fetching permissions:", error);
    return NextResponse.json(
      { error: "권한 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
