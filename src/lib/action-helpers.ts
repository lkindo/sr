/**
 * Server Actions 공통 헬퍼 함수
 * 인증, 권한, 검증 로직의 중복을 제거
 */

import { headers } from 'next/headers';
import { z } from 'zod';

import { auth } from '@/auth';
import { TooManyRequestsError, UnauthorizedError } from '@/lib/errors';
import { rateLimiters } from '@/lib/rate-limiter';
import { fail, Result } from '@/lib/result';
import { PermissionService } from '@/services/permission.service';
import { isAuthenticatedSession } from '@/types/session';

const permissionService = new PermissionService();

/**
 * 인증된 세션을 가져옵니다
 * @throws {UnauthorizedError} 세션이 없거나 인증되지 않은 경우
 */
export async function getAuthenticatedSession() {
  const session = await auth();
  if (!isAuthenticatedSession(session)) {
    throw new UnauthorizedError();
  }
  return session;
}

/**
 * 권한을 확인하고, 없으면 에러를 던집니다
 */
export async function requirePermission(userId: string, permission: string): Promise<void> {
  await permissionService.requirePermission(userId, permission);
}

/**
 * 인증 및 권한 확인을 한 번에 수행합니다
 */
export async function authenticateAndAuthorize(permission: string) {
  const session = await getAuthenticatedSession();
  await requirePermission(session.user.id, permission);
  return session;
}

/**
 * Zod 스키마로 검증하고, 실패 시 Result를 반환합니다
 */
export function validateWithSchema<T>(data: unknown, schema: z.ZodSchema<T>): Result<T> {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues?.[0].message || '입력값 검증에 실패했습니다.', 'VALIDATION_ERROR');
    }
    throw error;
  }
}

/**
 * Server Action의 공통 에러 처리 래퍼
 */
export function withActionErrorHandling<T>(action: () => Promise<Result<T>>): Promise<Result<T>> {
  return action().catch((error) => {
    if (error instanceof z.ZodError) {
      return fail(error.issues?.[0].message || '입력값 검증에 실패했습니다.', 'VALIDATION_ERROR');
    }
    throw error;
  });
}

/**
 * Server Action 내에서 IP 기반 속도 제한을 검사합니다.
 * 제한 초과 시 TooManyRequestsError를 발생시킵니다.
 */
export async function requireRateLimit(
  preset: keyof typeof rateLimiters = 'standard'
): Promise<void> {
  let ip = '127.0.0.1';
  try {
    const headersList = await headers();
    ip = headersList.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  } catch (error) {
    // 테스트 환경 등 Request Context가 없는 경우 예외 처리 및 127.0.0.1로 폴백
  }

  const limiter = rateLimiters[preset];
  const { allowed } = await limiter.check(ip);

  if (!allowed) {
    throw new TooManyRequestsError();
  }
}
