import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "현재 비밀번호를 입력하세요."),
  newPassword: z.string().min(6, "새 비밀번호는 최소 6자 이상이어야 합니다."),
  confirmPassword: z.string().min(1, "비밀번호 확인을 입력하세요."),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "새 비밀번호가 일치하지 않습니다.",
  path: ["confirmPassword"],
});

// POST /api/profile/password - 비밀번호 변경
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = changePasswordSchema.parse(body);

    // 현재 사용자 조회
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 현재 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(
      validated.currentPassword,
      user.password
    );

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "현재 비밀번호가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    // 새 비밀번호 해시화
    const hashedPassword = await bcrypt.hash(validated.newPassword, 10);

    // 비밀번호 업데이트
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      success: true,
      message: "비밀번호가 성공적으로 변경되었습니다."
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("Error changing password:", error);
    return NextResponse.json(
      { error: "비밀번호 변경 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
