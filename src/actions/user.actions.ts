'use server';

import type { User } from '@prisma/client';

import { authenticateAndAuthorize, getAuthenticatedSession } from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/permission-helpers';
import { ensureCanReadUser } from '@/lib/policies';
import { fail, ok, Result } from '@/lib/result';
import { services } from '@/services/service-registry';
import type { UserService } from '@/services/user.service';

type UserWithDetails = NonNullable<Awaited<ReturnType<UserService['getUserById']>>>;

/**
 * 사용자가 직접 로그아웃할 때 부른다. 유휴 자동 로그아웃에는 쓰지 않는다. sessionVersion 은 사용자
 * 단위라, 쓰면 한 기기가 유휴 상태가 되는 순간 다른 기기의 작업까지 끊긴다.
 */
export async function revokeMySessionsAction(): Promise<Result<void>> {
  try {
    const session = await getAuthenticatedSession();
    await services.userService.revokeSessions(session.user.id);
    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getProfileAction(): Promise<Result<UserWithDetails>> {
  try {
    const session = await getAuthenticatedSession();
    const userService = services.userService;
    const user = await userService.getUserById(session.user.id);
    if (!user) {
      return fail('프로필을 찾을 수 없습니다.', 'NOT_FOUND');
    }
    return ok(user);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getSRHandlersForSelection(): Promise<
  Result<Array<{ id: string; name: string; email: string }>>
> {
  try {
    await authenticateAndAuthorize(PERMISSIONS.SR.UPDATE);

    const userService = services.userService;
    const srHandlers = await userService.getUsersWithSRHandlingPermission();
    return ok(srHandlers);
  } catch (error) {
    return errorToResult(error);
  }
}
