import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const roleUpdateSchema = z.object({
  name: z.string().min(2, "역할 이름은 최소 2자 이상이어야 합니다.").optional(),
  description: z.string().optional(),
});

const permissionAssignSchema = z.object({
  permissionIds: z.array(z.string()),
});

// GET /api/roles/[id] - 특정 역할 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await prisma.role.findUnique({
      where: { id: params.id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        users: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      return NextResponse.json(
        { error: "역할을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(role);
  } catch (error) {
    console.error("Error fetching role:", error);
    return NextResponse.json(
      { error: "역할 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH /api/roles/[id] - 역할 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = roleUpdateSchema.parse(body);

    // Check if role exists
    const existingRole = await prisma.role.findUnique({
      where: { id: params.id },
    });

    if (!existingRole) {
      return NextResponse.json(
        { error: "역할을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // If name is being changed, check for duplicates
    if (validated.name && validated.name !== existingRole.name) {
      const duplicateRole = await prisma.role.findUnique({
        where: { name: validated.name },
      });

      if (duplicateRole) {
        return NextResponse.json(
          { error: "이미 존재하는 역할 이름입니다." },
          { status: 400 }
        );
      }
    }

    const role = await prisma.role.update({
      where: { id: params.id },
      data: validated,
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return NextResponse.json(role);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues?.[0].message },
        { status: 400 }
      );
    }

    console.error("Error updating role:", error);
    return NextResponse.json(
      { error: "역할 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/roles/[id] - 역할 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if role exists
    const existingRole = await prisma.role.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            users: true,
          },
        },
      },
    });

    if (!existingRole) {
      return NextResponse.json(
        { error: "역할을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Check if role is assigned to any users
    if (existingRole._count.users > 0) {
      return NextResponse.json(
        { error: "사용자가 할당된 역할은 삭제할 수 없습니다." },
        { status: 400 }
      );
    }

    await prisma.role.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: "역할이 삭제되었습니다." });
  } catch (error) {
    console.error("Error deleting role:", error);
    return NextResponse.json(
      { error: "역할 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
