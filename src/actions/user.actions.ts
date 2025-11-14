"use server";

import { z } from "zod";
import { UserService } from "@/services/user.service";
import { auth } from "@/auth";
import { PermissionService } from "@/services/permission.service";
import { userUpdateSchema } from "@/lib/schemas";
import { Result, ok, fail } from "@/lib/result";
import { errorToResult, UnauthorizedError } from "@/lib/errors";

const permissionService = new PermissionService();



export async function updateUserAction(formData: FormData): Promise<Result<any>> {
  try {
    const data = {
      name: formData.get("name") as string | undefined,
      email: formData.get("email") as string | undefined,
      image: formData.get("image") as string | undefined,
    };

    const validated = userUpdateSchema.parse(data);

    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }
    await permissionService.requirePermission(session.user.id, 'user:update');

    const userService = new UserService();
    const user = await userService.updateProfile(session.user.id, validated);

    return ok(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues?.[0].message || "입력값 검증에 실패했습니다.", "VALIDATION_ERROR");
    }
    return errorToResult(error);
  }
}



export async function changePasswordAction(formData: FormData): Promise<Result<void>> {
  try {
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      return fail("새 비밀번호와 확인 비밀번호가 일치하지 않습니다.", "VALIDATION_ERROR");
    }

    if (newPassword.length < 8) {
      return fail("비밀번호는 최소 8자 이상이어야 합니다.", "VALIDATION_ERROR");
    }

    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }
    await permissionService.requirePermission(session.user.id, 'user:change_password');

    const userService = new UserService();
    await userService.changePassword(session.user.id, currentPassword, newPassword);

    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}



export async function getUserAction(id: string): Promise<Result<any>> {
  try {
    const userService = new UserService();
    const user = await userService.getUserById(id);
    if (!user) {
      return fail("사용자를 찾을 수 없습니다.", "NOT_FOUND");
    }
    return ok(user);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getProfileAction(): Promise<Result<any>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }
    const userService = new UserService();
    const user = await userService.getUserById(session.user.id);
    if (!user) {
      return fail("프로필을 찾을 수 없습니다.", "NOT_FOUND");
    }
    return ok(user);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getSRHandlersForSelection(): Promise<Result<any>> {
  try {
    const userService = new UserService();
    const srHandlers = await userService.getUsersWithSRHandlingPermission();
    return ok(srHandlers);
  } catch (error) {
    return errorToResult(error);
  }
}
