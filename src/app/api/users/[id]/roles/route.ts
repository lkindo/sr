import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { NotFoundError, ValidationError } from "@/lib/errors";

const roleAssignSchema = z.object({
  roleIds: z.array(z.string()),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// POST /api/users/[id]/roles - 사용자에게 역할 할당 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(async (
  request: NextRequest,
  { session, params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;

  const body = await request.json();
  let validated;
  try {
    validated = roleAssignSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.issues[0].message);
    }
    throw error;
  }

  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw new NotFoundError("사용자를 찾을 수 없습니다.");
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
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)

