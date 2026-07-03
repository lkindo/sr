import { NextRequest, NextResponse } from 'next/server';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError } from '@/lib/errors';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import { UserService } from '@/services/user.service';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/users/sr-handlers - SR 처리(배정 가능) 사용자 목록 조회
// 인증 + SR:UPDATE 권한 필요. 실제 선별 로직은 서버 액션(getSRHandlersForSelection)과
// 동일하게 userService.getUsersWithSRHandlingPermission() 에 위임한다.
// (과거: 인증 부재 + 권한 키를 '.' 로 만들어 카탈로그(':')와 불일치 → 항상 빈 배열 반환 버그)
export const GET = withAuthAndRateLimit(
  async (_request: NextRequest, { session }) => {
    if (
      !session.user.roles.includes('ADMIN') &&
      !hasPermissionFlag(session.user, PERMISSIONS.SR.UPDATE)
    ) {
      throw new ForbiddenError('SR 담당자 목록을 조회할 권한이 없습니다.');
    }

    const userService = new UserService();
    const handlers = await userService.getUsersWithSRHandlingPermission();
    return NextResponse.json(handlers);
  },
  { preset: 'relaxed' }
);
