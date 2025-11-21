import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import { BusinessRuleError } from "@/lib/errors";
import { registerSchema } from "@/lib/schemas";

/**
 * 회원가입 API
 *
 * 새로운 사용자를 등록합니다.
 * - 비밀번호 복잡도 검증 (최소 8자, 대소문자, 숫자, 특수문자)
 * - 이메일 중복 확인
 * - 비밀번호 해싱 (bcrypt, salt rounds: 10)
 *
 * @param request - 회원가입 요청 (name, email, password, confirmPassword)
 * @returns 201 - 생성된 사용자 정보
 * @returns 400 - 검증 실패 또는 중복 이메일
 * @returns 500 - 서버 오류
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 비밀번호 복잡도 검증 포함
    const validated = registerSchema.parse(body);

    const { name, email, password } = validated;

    // 이메일 중복 확인
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "이미 존재하는 이메일입니다.",
            code: "EMAIL_ALREADY_EXISTS",
          }
        },
        { status: 400 }
      );
    }

    // 비밀번호 해싱 (bcrypt, salt rounds: 10)
    const hashedPassword = await hash(password, 10);

    // 사용자 생성
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "회원가입이 성공적으로 완료되었습니다.",
        data: {
          user: {
            ...user,
            createdAt: user.createdAt.toISOString(),
          }
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Validation error:", error.issues);
      return NextResponse.json(
        {
          success: false,
          error: {
            message: error.issues[0].message,
            code: "VALIDATION_ERROR",
            details: error.issues,
          }
        },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      console.error("Register error:", error.message);
      // Prisma 관련 오류일 경우
      if (error.message.includes("connect") || error.message.includes("database")) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: "데이터베이스 연결에 실패했습니다. 서버 상태를 확인해주세요.",
              code: "DATABASE_ERROR",
            }
          },
          { status: 500 }
        );
      }
    }

    console.error("Unexpected register error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          message: "회원가입 처리 중 오류가 발생했습니다.",
          code: "INTERNAL_SERVER_ERROR",
        }
      },
      { status: 500 }
    );
  }
}