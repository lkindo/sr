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
