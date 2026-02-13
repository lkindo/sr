import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { changePasswordSchema } from '@/lib/schemas';

// POST /api/profile/password - 비밀번호 변경 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    if (!session?.user?.email) {
      throw new UnauthorizedError('유효하지 않은 세션입니다. 다시 로그인해주세요.');
    }

    const body = await request.json();

    let validated;
    try {
      validated = changePasswordSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message);
      }
      throw error;
    }

    // 현재 사용자 조회
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user) {
      throw new NotFoundError('사용자');
    }

    // 현재 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(validated.currentPassword, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedError('현재 비밀번호가 올바르지 않습니다.');
    }

    // 새 비밀번호 해시화
    const hashedPassword = await bcrypt.hash(validated.newPassword, 12);

    // 비밀번호 업데이트
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      success: true,
      message: '비밀번호가 성공적으로 변경되었습니다.',
    });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
