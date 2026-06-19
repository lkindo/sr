'use server';

import type { User } from '@prisma/client';

import {
  authenticateAndAuthorize,
  getAuthenticatedSession,
  requireRateLimit,
  validateWithSchema,
} from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { getFormDataValue } from '@/lib/form-data-parser';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import { ensureCanReadUser } from '@/lib/policies';
import { fail, ok, Result } from '@/lib/result';
import { changePasswordSchema, userUpdateSchema } from '@/lib/schemas';
import { services } from '@/services/service-registry';
import type { UserService } from '@/services/user.service';

export async function updateUserAction(
  formData: FormData
): Promise<Result<Omit<User, 'password'>>> {
  try {
    const data = {
      name: getFormDataValue(formData, 'name') || undefined,
      email: getFormDataValue(formData, 'email') || undefined,
      image: getFormDataValue(formData, 'image') || undefined,
    };

    const validationResult = validateWithSchema(data, userUpdateSchema);
    if (!validationResult.success) {
      return validationResult;
    }
    const validated = validationResult.data;

    const session = await authenticateAndAuthorize('user:update');

    const userService = services.userService;
    const user = await userService.updateProfile(session.user.id, validated);

    return ok(user);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function changePasswordAction(formData: FormData): Promise<Result<void>> {
  try {
    await requireRateLimit('strict');
    const data = {
      currentPassword: getFormDataValue(formData, 'currentPassword') || '',
      newPassword: getFormDataValue(formData, 'newPassword') || '',
      confirmNewPassword: getFormDataValue(formData, 'confirmPassword') || '',
    };

    const validationResult = validateWithSchema(data, changePasswordSchema);
    if (!validationResult.success) {
      return validationResult;
    }

    const { currentPassword, newPassword } = validationResult.data;

    const session = await authenticateAndAuthorize('user:change_password');

    const userService = services.userService;
    await userService.changePassword(session.user.id, currentPassword, newPassword);

    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}

type UserWithDetails = NonNullable<Awaited<ReturnType<UserService['getUserById']>>>;

export async function getUserAction(id: string): Promise<Result<UserWithDetails>> {
  try {
    const session = await getAuthenticatedSession();

    const userService = services.userService;
    const user = await userService.getUserById(id);
    if (!user) {
      return fail('사용자를 찾을 수 없습니다.', 'NOT_FOUND');
    }

    // 공통 Policy 검증 적용
    ensureCanReadUser(session.user, user as any);

    return ok(user);
  } catch (error) {
    const result = errorToResult(error);
    if (result.code === 'FORBIDDEN' && result.error === '사용자 조회 권한이 없습니다.') {
      result.error = '권한이 없습니다.';
    }
    return result;
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
