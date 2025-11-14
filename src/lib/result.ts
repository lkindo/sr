/**
 * 공통 Result 타입
 * Service 및 Action 레이어에서 일관된 응답 형식을 제공합니다.
 */
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

/**
 * 성공 응답 헬퍼 함수
 */
export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

/**
 * 실패 응답 헬퍼 함수
 */
export function fail<T>(error: string, code?: string): Result<T> {
  return { success: false, error, code };
}
