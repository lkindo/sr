/**
 * API Route 공통 헬퍼 함수
 * 검증, 에러 처리 로직의 중복을 제거
 */

import { z } from 'zod';

import { BadRequestError, firstZodIssueMessage, ValidationError } from '@/lib/errors';

/**
 * 요청 본문을 JSON 으로 파싱한다.
 *
 * `request.json()` 을 그냥 호출하면 깨진 본문에서 `SyntaxError` 가 던져지고, 그것은
 * ServiceError 가 아니므로 에러 핸들러가 **500** 으로 매핑한다(감사 4.3).
 * 클라이언트 잘못인 요청이 서버 오류로 보고되면, 5xx 만 재시도하는 클라이언트는
 * 절대 성공할 수 없는 요청을 계속 재시도한다.
 *
 * 빈 본문도 같은 취급을 한다 — `JSON.parse('')` 역시 SyntaxError 다.
 * 구조 분해로 바로 쓰다 `null` 에서 TypeError 가 나는 경로도 여기서 막는다.
 *
 * @throws {BadRequestError} 본문이 없거나 JSON 이 아닐 때 (400)
 */
export async function parseJsonBody(request: Request): Promise<unknown> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new BadRequestError('요청 본문을 읽을 수 없습니다.');
  }

  if (raw.trim() === '') {
    throw new BadRequestError('요청 본문이 비어 있습니다.');
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestError('요청 본문이 올바른 JSON 형식이 아닙니다.');
  }
}

/**
 * Zod 스키마로 요청 바디를 검증합니다
 * @throws {BadRequestError} 본문이 JSON 이 아닐 때 (400)
 * @throws {ValidationError} 검증 실패 시 (400)
 */
export async function validateRequestBody<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
  // 파싱을 try 안으로 들여왔다. 예전에는 이 호출이 try 밖에 있어 깨진 JSON 이 500 이 됐다.
  const body = await parseJsonBody(request);

  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(firstZodIssueMessage(error));
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
