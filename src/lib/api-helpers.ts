/**
 * API Route 공통 헬퍼 함수
 * 검증, 에러 처리 로직의 중복을 제거
 */

import { z } from "zod";
import { ValidationError } from "@/lib/errors";

/**
 * Zod 스키마로 요청 바디를 검증합니다
 * @throws {ValidationError} 검증 실패 시
 */
export async function validateRequestBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  const body = await request.json();
  
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.issues[0].message);
    }
    throw error;
  }
}

/**
 * RouteContext 타입 정의 (공통)
 */
export type RouteContext<T extends Record<string, string> = { id: string }> = {
  params: Promise<T>;
};


