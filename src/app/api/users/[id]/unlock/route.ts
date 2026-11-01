import { NextRequest, NextResponse } from 'next/server';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { clearLoginFailures } from '@/lib/login-throttle';
import { canManageSensitiveUserFields } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limiter';
import { auditService } from '@/services/audit.service';
import { UserService } from '@/services/user.service';

// POST /api/users/[id]/unlock - 로그인 잠금 해제 (Rate Limit: 엄격)
// 타인 계정의 민감 정보를 관리할 수 있는 사람만 푼다. 이메일만 알면 누구나 잠글 수 있으므로,
// 없으면 잠긴 관리자를 푸는 방법이 15분 대기나 서버 재시작뿐이다.
export const POST = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const target = await new UserService().getUserById(id);
    if (!target) {
      throw new NotFoundError('사용자');
    }

    if (!canManageSensitiveUserFields(session.user, target)) {
      throw new ForbiddenError('이 사용자의 로그인 잠금을 풀 권한이 없습니다.');
    }

    clearLoginFailures(target.email);

    const clientIp = getClientIp(request.headers);
    try {
      await auditService.createLog(prisma, {
        userId: session.user.id,
        actionType: 'LOGIN_UNLOCK',
        targetEntity: 'User',
        targetId: id,
        changes: {},
        ipAddress: clientIp === 'unknown' ? null : clientIp,
      });
    } catch (error) {
      // 잠금은 이미 풀렸다. 기록 실패로 관리자에게 실패를 돌려주면 다시 시도하게 된다.
      logger.warn('[Auth] 잠금 해제 기록을 남기지 못했습니다.', {
        custom_error: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({ success: true });
  },
  { preset: 'strict' }
);
