import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// GET /api/service-categories - 모든 활성 서비스 카테고리 조회
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const categories = await prisma.serviceCategory.findMany({
      where: { isActive: true },
      select: {
        id: true,
        categoryName: true,
        description: true,
        slaHours: true,
        priority: true,
      },
      orderBy: { categoryName: "asc" },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching service categories:", error);
    return NextResponse.json(
      { error: "서비스 카테고리 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
