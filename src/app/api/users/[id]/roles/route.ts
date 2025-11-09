import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const roleAssignSchema = z.object({
  roleIds: z.array(z.string()),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// POST /api/users/[id]/roles - 사용자에게 역할 할당
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = roleAssignSchema.parse(body);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Delete existing roles
    await prisma.userRole.deleteMany({
      where: { userId: id },
    });

    // Add new roles
    if (validated.roleIds.length > 0) {
      await prisma.userRole.createMany({
        data: validated.roleIds.map((roleId) => ({
          userId: id,
          roleId,
        })),
      });
    }

    // Fetch updated user with roles
    const updatedUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues?.[0].message },
        { status: 400 }
      );
    }

    console.error("Error assigning roles:", error);
    return NextResponse.json(
      { error: "역할 할당 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

