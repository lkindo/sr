/**
 * API 응답 표준화 유틸리티
 */

import { NextResponse } from "next/server";

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export interface ApiSuccess<T = unknown> {
  data: T;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

/**
 * 성공 응답 생성
 */
export function successResponse<T>(
  data: T,
  status: number = 200,
  message?: string
): NextResponse {
  const response: ApiSuccess<T> = {
    data,
    ...(message && { message }),
  };

  return NextResponse.json(response, { status });
}

/**
 * 에러 응답 생성
 */
export function errorResponse(
  error: string,
  status: number = 500,
  code?: string,
  details?: unknown
): NextResponse {
  const response: ApiError = {
    error,
    ...(code && { code }),
    ...(details && { details }),
  };

  return NextResponse.json(response, { status });
}

/**
 * 유효성 검사 에러 응답
 */
export function validationErrorResponse(errors: unknown): NextResponse {
  return errorResponse("유효성 검사 실패", 400, "VALIDATION_ERROR", errors);
}

/**
 * 인증 실패 응답
 */
export function unauthorizedResponse(
  message: string = "인증이 필요합니다."
): NextResponse {
  return errorResponse(message, 401, "UNAUTHORIZED");
}

/**
 * 권한 부족 응답
 */
export function forbiddenResponse(
  message: string = "권한이 없습니다."
): NextResponse {
  return errorResponse(message, 403, "FORBIDDEN");
}

/**
 * 리소스 찾을 수 없음 응답
 */
export function notFoundResponse(
  resource: string = "리소스"
): NextResponse {
  return errorResponse(
    `${resource}을(를) 찾을 수 없습니다.`,
    404,
    "NOT_FOUND"
  );
}

/**
 * 서버 에러 응답
 */
export function serverErrorResponse(
  message: string = "서버 오류가 발생했습니다.",
  error?: unknown
): NextResponse {
  console.error("Server error:", error);
  return errorResponse(message, 500, "SERVER_ERROR");
}

/**
 * 페이지네이션 응답 생성
 */
export function paginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): NextResponse {
  const response = {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };

  return NextResponse.json(response);
}


