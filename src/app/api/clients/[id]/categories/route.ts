import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const categorySchema = z.object({
  categoryName: z.string().min(2, "카테고리 이름은 최소 2자 이상이어야 합니다."),
  description: z.string().optional(),
  slaHours: z.number().min(1, "SLA는 최소 1시간 이상이어야 합니다."),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
  handlerId: z.string().optional(),
  backupHandlerId: z.string().optional(),
});

// GET /api/clients/[id]/categories - 고객사의 서비스 카테고리 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const categories = await prisma.serviceCategory.findMany({
      where: {
        clientId: params.id,
        isActive: true,
      },
      include: {
        handler: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        backupHandler: {
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

    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "서비스 카테고리 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/clients/[id]/categories - 서비스 카테고리 생성
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = categorySchema.parse(body);

    // 고객사 존재 확인
    const client = await prisma.client.findUnique({
      where: { id: params.id },
    });

    if (!client) {
      return NextResponse.json(
        { error: "고객사를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 카테고리 생성
    const category = await prisma.serviceCategory.create({
      data: {
        clientId: params.id,
        categoryName: validated.categoryName,
        description: validated.description,
        slaHours: validated.slaHours,
        priority: validated.priority,
        handlerId: validated.handlerId || null,
        backupHandlerId: validated.backupHandlerId || null,
      },
      include: {
        handler: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        backupHandler: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues?.[0];
      return NextResponse.json(
        { error: firstError?.message || "유효성 검사 실패" },
        { status: 400 }
      );
    }

    console.error("Error creating category:", error);
    return NextResponse.json(
      { error: "서비스 카테고리 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
