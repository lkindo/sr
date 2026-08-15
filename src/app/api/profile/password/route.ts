import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { validateRequestBody } from '@/lib/api-helpers';
import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { UnauthorizedError } from '@/lib/errors';
import { passwordSchema } from '@/lib/schemas';
import { UserService } from '@/services/user.service';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력하세요.'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, '비밀번호 확인을 입력하세요.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: '새 비밀번호가 일치하지 않습니다.',
    path: ['confirmPassword'],
  });

// POST /api/profile/password - 비밀번호 변경 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    if (!session?.user?.id) {
      throw new UnauthorizedError('유효하지 않은 세션입니다. 다시 로그인해주세요.');
    }

    const validated = await validateRequestBody(request, changePasswordSchema);

    // 서비스 계층이 현재 비밀번호 확인, sessionVersion 증가, 감사 로그를 같은
    // 트랜잭션에서 수행한다. 라우트에서 직접 update 하면 기존 세션 폐기와 감사가 빠진다.
    const userService = new UserService();
    await userService.changePassword(
      session.user.id,
      validated.currentPassword,
      validated.newPassword,
      session.user.id
    );

    return NextResponse.json({
      success: true,
      message: '비밀번호가 성공적으로 변경되었습니다.',
    });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
