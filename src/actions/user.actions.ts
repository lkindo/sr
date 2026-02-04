'use server';

import type { User } from '@prisma/client';

import {
  authenticateAndAuthorize,
  getAuthenticatedSession,
  validateWithSchema,
} from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { getFormDataValue } from '@/lib/form-data-parser';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import { fail, ok, Result } from '@/lib/result';
import { userUpdateSchema } from '@/lib/schemas';
import { UserService } from '@/services/user.service';

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

    const userService = new UserService();
    const user = await userService.updateProfile(session.user.id, validated);

    return ok(user);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function changePasswordAction(formData: FormData): Promise<Result<void>> {
  try {
    const currentPassword = getFormDataValue(formData, 'currentPassword') || '';
    const newPassword = getFormDataValue(formData, 'newPassword') || '';
    const confirmPassword = getFormDataValue(formData, 'confirmPassword') || '';

    if (newPassword !== confirmPassword) {
      return fail('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.', 'VALIDATION_ERROR');
    }

    if (newPassword.length < 8) {
      return fail('비밀번호는 최소 8자 이상이어야 합니다.', 'VALIDATION_ERROR');
    }

    const session = await authenticateAndAuthorize('user:change_password');

    const userService = new UserService();
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

    if (session.user.id !== id && !hasPermissionFlag(session.user, PERMISSIONS.USER.READ)) {
      return fail('권한이 없습니다.', 'FORBIDDEN');
    }

    const userService = new UserService();
    const user = await userService.getUserById(id);
    if (!user) {
      return fail('사용자를 찾을 수 없습니다.', 'NOT_FOUND');
    }
    return ok(user);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getProfileAction(): Promise<Result<UserWithDetails>> {
  try {
    const session = await getAuthenticatedSession();
    const userService = new UserService();
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

    const userService = new UserService();
    const srHandlers = await userService.getUsersWithSRHandlingPermission();
    return ok(srHandlers);
  } catch (error) {
    return errorToResult(error);
  }
}
