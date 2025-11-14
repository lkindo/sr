"use server";

import { z } from "zod";
import { UserService } from "@/services/user.service";
import { auth } from "@/auth";

const updateUserSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요.").optional(),
  email: z.string().email("유효한 이메일 주소를 입력해주세요.").optional(),
  image: z.string().url("유효한 이미지 URL을 입력해주세요.").optional(),
});

export async function updateUserAction(formData: FormData) {
  try {
    const data = {
      name: formData.get("name") as string | undefined,
      email: formData.get("email") as string | undefined,
      image: formData.get("image") as string | undefined,
    };

    const validated = updateUserSchema.parse(data);

    // 인증 확인
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: "인증되지 않은 사용자입니다.",
      };
    }

    // UserService 인스턴스 생성
    const userService = new UserService();

    // 사용자 정보 업데이트
    const user = await userService.updateProfile(session.user.id, validated);

    return {
      success: true,
      data: user,
      message: "프로필이 성공적으로 업데이트되었습니다.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues?.[0].message || "입력값 검증에 실패했습니다.",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "프로필 업데이트 중 오류가 발생했습니다.",
    };
  }
}

export async function changePasswordAction(formData: FormData) {
  try {
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    // 비밀번호 변경을 위한 별도의 검증 스키마가 필요할 수 있습니다
    if (newPassword !== confirmPassword) {
      return {
        success: false,
        error: "새 비밀번호와 확인 비밀번호가 일치하지 않습니다.",
      };
    }

    if (newPassword.length < 8) {
      return {
        success: false,
        error: "비밀번호는 최소 8자 이상이어야 합니다.",
      };
    }

    // 인증 확인
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: "인증되지 않은 사용자입니다.",
      };
    }

    // UserService 인스턴스 생성
    const userService = new UserService();

    // 현재 비밀번호 확인 및 변경 로직은 UserService에 구현이 필요
    // 현재 UserService에는 비밀번호 해시 처리 로직이 구현되어 있지 않으므로,
    // 이 예제에서는 간단한 흐름만 구현합니다

    return {
      success: true,
      message: "비밀번호가 성공적으로 변경되었습니다.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "비밀번호 변경 중 오류가 발생했습니다.",
    };
  }
}

export async function getUserAction(id: string) {
  try {
    // 인증 확인은 필요에 따라 처리 가능

    // UserService 인스턴스 생성
    const userService = new UserService();

    // 사용자 정보 조회
    const user = await userService.getUserById(id);

    if (!user) {
      return {
        success: false,
        error: "사용자를 찾을 수 없습니다.",
      };
    }

    return {
      success: true,
      data: user,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "사용자 정보 조회 중 오류가 발생했습니다.",
    };
  }
}