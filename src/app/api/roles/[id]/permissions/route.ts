import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const permissionAssignSchema = z.object({
  permissionIds: z.array(z.string()),
});

// POST /api/roles/[id]/permissions - 역할에 권한 할당
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
    const validated = permissionAssignSchema.parse(body);

    // Check if role exists
    const role = await prisma.role.findUnique({
      where: { id: params.id },
    });

    if (!role) {
      return NextResponse.json(
        { error: "역할을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Delete existing permissions
    await prisma.rolePermission.deleteMany({
      where: { roleId: params.id },
    });

    // Add new permissions
    if (validated.permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: validated.permissionIds.map((permissionId) => ({
          roleId: params.id,
          permissionId,
        })),
      });
    }

    // Fetch updated role with permissions
    const updatedRole = await prisma.role.findUnique({
      where: { id: params.id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return NextResponse.json(updatedRole);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues?.[0].message },
        { status: 400 }
      );
    }

    console.error("Error assigning permissions:", error);
    return NextResponse.json(
      { error: "권한 할당 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
