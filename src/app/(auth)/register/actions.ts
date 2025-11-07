"use server";

import { hash } from "bcryptjs";
import prisma from "@/lib/prisma";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "이름은 최소 2자 이상이어야 합니다."),
  email: z.string().email("유효한 이메일 주소를 입력하세요."),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다."),
});

export async function registerUser(formData: FormData) {
  try {
    const data = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    const validated = registerSchema.parse(data);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      return {
        success: false,
        error: "이미 등록된 이메일 주소입니다.",
      };
    }

    // Hash password
    const hashedPassword = await hash(validated.password, 12);

    // Create user
    await prisma.user.create({
      data: {
        name: validated.name,
        email: validated.email,
        password: hashedPassword,
      },
    });

    return {
      success: true,
      message: "회원가입이 완료되었습니다. 로그인해주세요.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message,
      };
    }

    return {
      success: false,
      error: "회원가입 중 오류가 발생했습니다.",
    };
  }
}
