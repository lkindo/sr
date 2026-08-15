import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { validateRequestBody } from '@/lib/api-helpers';
import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError, UnauthorizedError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { FIELD_LIMITS } from '@/lib/schemas';

/**
 * 프로필 수정.
 *
 * **상한은 `FIELD_LIMITS` 에서 가져온다** — `users.name` 은 varchar(50),
 * `users.image` 는 varchar(1024) 다. 상한이 없으면 검증을 통과한 뒤 DB 가 P2000 을 던지고,
 * 사용자에게는 원인을 알 수 없는 실패로 보인다(`src/lib/schemas.ts` 머리말 참조).
 *
 * 스키마 자체를 `@/lib/schemas` 로 옮기지 않는 이유는 그쪽 주석이 밝힌 대로
 * `image` 의 `.or(z.literal(''))`(아바타 지우기) 분기가 이 경로 전용이기 때문이다.
 * **상수만 공유한다.**
 */
const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, '이름은 최소 2자 이상이어야 합니다.')
    .max(FIELD_LIMITS.NAME, `이름은 ${FIELD_LIMITS.NAME}자를 초과할 수 없습니다.`)
    .optional(),
  image: z
    .string()
    .url('유효한 URL을 입력하세요.')
    .max(FIELD_LIMITS.URL, `이미지 URL이 너무 깁니다.`)
    .optional()
    .or(z.literal('')),
});

// GET /api/profile - 현재 사용자 프로필 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    if (!session?.user?.email) {
      throw new UnauthorizedError('유효하지 않은 세션입니다. 다시 로그인해주세요.');
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
      throw new NotFoundError('사용자');
    }

    const serializableUser = {
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
    return NextResponse.json(serializableUser);
  },
  { preset: 'standard' }
); // 1분당 100회

// PATCH /api/profile - 프로필 업데이트 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    if (!session?.user?.email) {
      throw new UnauthorizedError('유효하지 않은 세션입니다. 다시 로그인해주세요.');
    }

    const validated = await validateRequestBody(request, updateProfileSchema);

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
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
