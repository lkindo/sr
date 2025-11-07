import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const categorySchema = z.object({
  categoryName: z.string().min(2, "카테고리 이름은 최소 2자 이상이어야 합니다."),
  description: z.string().optional(),
});

// GET /api/clients/[id]/categories - 고객사의 서비스 카테고리 조회
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
      where: { clientId: params.id },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "카테고리 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/clients/[id]/categories - 서비스 카테고리 추가
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

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id: params.id },
    });

    if (!client) {
      return NextResponse.json(
        { error: "고객사를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Check if category already exists for this client
    const existingCategory = await prisma.serviceCategory.findFirst({
      where: {
        clientId: params.id,
        categoryName: validated.categoryName,
      },
    });

    if (existingCategory) {
      return NextResponse.json(
        { error: "이미 존재하는 카테고리 이름입니다." },
        { status: 400 }
      );
    }

    const category = await prisma.serviceCategory.create({
      data: {
        clientId: params.id,
        categoryName: validated.categoryName,
        description: validated.description,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Error creating category:", error);
    return NextResponse.json(
      { error: "카테고리 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
