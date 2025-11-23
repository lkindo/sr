import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { NotFoundError, BadRequestError, ValidationError, UnauthorizedError } from "@/lib/errors";

const updateProfileSchema = z.object({
  name: z.string().min(2, "이름은 최소 2자 이상이어야 합니다.").optional(),
  image: z.string().url("유효한 URL을 입력하세요.").optional().or(z.literal("")),
});

// GET /api/profile - 현재 사용자 프로필 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (request: NextRequest, { session }) => {
  if (!session?.user?.email) {
    throw new UnauthorizedError("유효하지 않은 세션입니다. 다시 로그인해주세요.");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      roles: {
        include: {
          role: true,
        },
      },
      clients: {
        include: {
          client: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError("사용자");
  }

  const serializableUser = {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
  return NextResponse.json(serializableUser);
}, { preset: 'standard' }); // 1분당 100회

// PATCH /api/profile - 프로필 업데이트 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(async (request: NextRequest, { session }) => {
  if (!session?.user?.email) {
    throw new UnauthorizedError("유효하지 않은 세션입니다. 다시 로그인해주세요.");
  }

  const body = await request.json();

  let validated;
  try {
    validated = updateProfileSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.issues[0].message);
    }
    throw error;
  }

  const updateData: Prisma.UserUncheckedUpdateInput = {};
  if (validated.name !== undefined) updateData.name = validated.name;
  if (validated.image !== undefined) updateData.image = validated.image || null;

  const user = await prisma.user.update({
    where: { email: session.user.email },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const serializableUser = {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
  return NextResponse.json(serializableUser);
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)
