import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// GET /api/srs/[id]/activities - SR 활동 이력 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activities = await prisma.sRActivity.findMany({
      where: { srId: params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    return NextResponse.json(
      { error: "활동 이력을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
