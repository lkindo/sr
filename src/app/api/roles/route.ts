import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

const roleSchema = z.object({
  name: z.string().min(2, "역할 이름은 최소 2자 이상이어야 합니다."),
  description: z.string().optional(),
});

// GET /api/roles - 모든 역할 조회
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roles = await prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: {
            users: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(roles);
  } catch (error) {
    console.error("Error fetching roles:", error);
    return NextResponse.json(
      { error: "역할 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/roles - 새 역할 생성
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = roleSchema.parse(body);

    // Check if role already exists
    const existingRole = await prisma.role.findUnique({
      where: { name: validated.name },
    });

    if (existingRole) {
      return NextResponse.json(
        { error: "이미 존재하는 역할 이름입니다." },
        { status: 400 }
      );
    }

    const role = await prisma.role.create({
      data: {
        name: validated.name,
        description: validated.description,
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues?.[0].message },
        { status: 400 }
      );
    }

    console.error("Error creating role:", error);
    return NextResponse.json(
      { error: "역할 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
