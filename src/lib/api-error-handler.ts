import { NextResponse } from "next/server";
import { ServiceError } from "./errors";
import { ZodError } from "zod";

/**
 * API Routes에서 에러를 처리하고 적절한 HTTP 응답을 반환하는 헬퍼 함수
 */
export function handleApiError(error: unknown): NextResponse {
  // ServiceError 처리
  if (error instanceof ServiceError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.statusCode }
    );
  }

  // Zod 유효성 검증 에러 처리
  if (error instanceof ZodError) {
    const firstError = error.issues?.[0];
    return NextResponse.json(
      {
        error: firstError?.message || "유효성 검사 실패",
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  // 일반 Error 처리
  if (error instanceof Error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      {
        error: error.message,
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }

  // 알 수 없는 에러
  console.error("Unknown error:", error);
  return NextResponse.json(
    {
      error: "알 수 없는 오류가 발생했습니다.",
      code: "UNKNOWN_ERROR",
    },
    { status: 500 }
  );
}
