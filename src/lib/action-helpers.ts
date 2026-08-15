/**
 * Server Actions 공통 헬퍼 함수
 * 인증, 권한, 검증 로직의 중복을 제거
 */

import { headers } from 'next/headers';
import { z } from 'zod';

import { auth } from '@/auth';
import { firstZodIssueMessage, TooManyRequestsError, UnauthorizedError } from '@/lib/errors';
import { getClientIp, rateLimiters } from '@/lib/rate-limiter';
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
      return fail(firstZodIssueMessage(error, '입력값 검증에 실패했습니다.'), 'VALIDATION_ERROR');
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
      return fail(firstZodIssueMessage(error, '입력값 검증에 실패했습니다.'), 'VALIDATION_ERROR');
    }
    throw error;
  });
}

/**
 * Server Action 내에서 IP 기반 속도 제한을 검사합니다.
 * 제한 초과 시 TooManyRequestsError를 발생시킵니다.
 *
 * **키는 세션 주체 우선, 없으면 IP 다** (감사 D-15).
 *
 * 예전에는 항상 IP 로만 키잉했다. 그래서 NAT 뒤 사무실에서 여러 직원이 동시에 SR 을
 * 등록·수정하면 분당 5회(strict)를 **전체가 나눠 썼고**, 정상 업무가 429 로 막혔다.
 * API 라우트 쪽은 이미 세션별로 키잉하고 있어 같은 행위가 경로에 따라 다르게 막혔다.
 *
 * 세션 키에는 IP 천장을 함께 건다 — API 경로와 같은 이유다. 세션은 여기서 실제로
 * 검증된 값(`auth()`)이라 위조할 수 없지만, 미인증 액션은 IP 로만 잡히므로 두 경로가
 * 같은 상한 아래 있게 된다.
 *
 * @param preset 사용할 리미터 프리셋
 * @param namespace 액션 구분자. **필수다.** 이걸 빼면 SR 생성·수정·삭제·회원가입이
 *   한 버킷을 공유해, 한 액션의 폭주가 나머지 전부를 잠근다.
 */
export async function requireRateLimit(
  preset: keyof typeof rateLimiters = 'standard',
  namespace = 'action'
): Promise<void> {
  let ip = '127.0.0.1';
  try {
    const headersList = await headers();
    // 신뢰 프록시 기반 IP 해석 (조작 가능한 XFF 첫 항목 사용 금지)
    ip = getClientIp(headersList);
  } catch {
    // 테스트 환경 등 Request Context가 없는 경우 예외 처리 및 127.0.0.1로 폴백
  }

  // 인증 여부는 액션마다 다르다(회원가입은 미인증). 세션이 없으면 IP 로 떨어진다.
  let subject: string | null = null;
  try {
    const session = await auth();
    if (isAuthenticatedSession(session)) subject = session.user.id;
  } catch {
    // 세션 해석 실패는 미인증과 동일하게 취급한다(fail-closed 방향).
  }

  const limiter = rateLimiters[preset];

  const primary = subject ? `${namespace}:user:${subject}` : `${namespace}:ip:${ip}`;
  const { allowed } = await limiter.check(primary);
  if (!allowed) {
    throw new TooManyRequestsError();
  }

  // 발신 IP 천장. **네임스페이스를 붙이지 않는다** — 모든 서버 액션이 이 하나를 공유해야
  // 합산 한도가 성립한다.
  //
  // 여기에 긴장이 있다. 버킷을 액션별로 나누면 한 액션의 폭주가 다른 액션을 잠그지
  // 않지만, 그것만으로는 액션 수만큼 실효 한도가 곱해진다. 그래서 두 층으로 둔다:
  //   - 주 버킷(액션 × 주체): 정상 업무가 서로를 막지 않는다.
  //   - IP 천장(전 액션 공유): 한 발신지의 총량은 여전히 유한하다.
  if (subject) {
    const ceiling = await limiter.check(`action-ip:${ip}`, ACTION_IP_CEILING_MULTIPLIER);
    if (!ceiling.allowed) {
      throw new TooManyRequestsError();
    }
  }
}

/** 세션 키로 잡힌 서버 액션에 함께 적용하는 IP 천장 배수. API 경로와 같은 취지다. */
const ACTION_IP_CEILING_MULTIPLIER = 20;
