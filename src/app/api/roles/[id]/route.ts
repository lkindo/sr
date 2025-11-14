import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { NotFoundError, BadRequestError, ValidationError } from "@/lib/errors";

const roleUpdateSchema = z.object({
  name: z.string().min(2, "역할 이름은 최소 2자 이상이어야 합니다.").optional(),
  description: z.string().optional(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// GET /api/roles/[id] - 특정 역할 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;

  const role = await prisma.role.findUnique({
    where: { id },
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
    throw new NotFoundError("역할을 찾을 수 없습니다.");
  }

  return NextResponse.json(role);
}, { preset: 'standard' }); // 1분당 100회

// PATCH /api/roles/[id] - 역할 수정 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;
  
  const body = await request.json();
  let validated;
  try {
    validated = roleUpdateSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.issues[0].message);
    }
    throw error;
  }

  // Check if role exists
  const existingRole = await prisma.role.findUnique({
    where: { id },
  });

  if (!existingRole) {
    throw new NotFoundError("역할을 찾을 수 없습니다.");
  }

  // If name is being changed, check for duplicates
  if (validated.name && validated.name !== existingRole.name) {
    const duplicateRole = await prisma.role.findUnique({
      where: { name: validated.name },
    });

    if (duplicateRole) {
      throw new BadRequestError("이미 존재하는 역할 이름입니다.");
    }
  }

  const role = await prisma.role.update({
    where: { id },
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
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)

// DELETE /api/roles/[id] - 역할 삭제 (Rate Limit: 엄격)
export const DELETE = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;

  // Check if role exists
  const existingRole = await prisma.role.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          users: true,
        },
      },
    },
  });

  if (!existingRole) {
    throw new NotFoundError("역할을 찾을 수 없습니다.");
  }

  // Check if role is assigned to any users
  if (existingRole._count.users > 0) {
    throw new BadRequestError("사용자가 할당된 역할은 삭제할 수 없습니다.");
  }

  await prisma.role.delete({
    where: { id },
  });

  return NextResponse.json({ message: "역할이 삭제되었습니다." });
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)
