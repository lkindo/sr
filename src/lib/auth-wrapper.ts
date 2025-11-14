/**
 * Authenticated Route Handler Wrapper
 *
 * API Route Handler에서 반복되는 인증 로직을 제거하기 위한 유틸리티
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { handleApiError } from './api-error-handler';
import { UnauthorizedError } from './errors';
import type { Session } from 'next-auth';

/**
 * 인증된 사용자 정보를 포함하는 컨텍스트
 */
export interface AuthenticatedContext<P = Promise<Record<string, string>>> {
  /**
   * NextAuth 세션
   */
  session: Session;

  /**
   * Route params (동적 라우트의 경우)
   */
  params: P;
}

/**
 * 인증이 필요한 Route Handler 래퍼
 *
 * @example
 * ```typescript
 * export const GET = withAuth(async (request, { session }) => {
 *   // session이 보장됨 (타입 안전)
 *   const userId = session.user.id;
 *   return NextResponse.json({ userId });
 * });
 * ```
 */
export function withAuth<T extends NextRequest = NextRequest, P = Promise<Record<string, string>>>(
  handler: (request: T, context: AuthenticatedContext<P>) => Promise<NextResponse>
) {
  return async (request: T, routeContext: { params: P }): Promise<NextResponse> => {
    try {
      // 인증 확인
      const session = await auth();
      if (!session) {
        throw new UnauthorizedError();
      }

      // 인증된 핸들러 실행
      const context: AuthenticatedContext<P> = {
        session,
        params: routeContext.params,
      };

      return await handler(request, context);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

/**
 * 인증이 필요 없는 Route Handler 래퍼 (에러 핸들링만)
 *
 * @example
 * ```typescript
 * export const POST = withErrorHandler(async (request) => {
 *   // 에러 발생 시 자동으로 handleApiError로 처리
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function withErrorHandler<T extends NextRequest = NextRequest, P = Promise<Record<string, string>>>(
  handler: (request: T, context: { params: P }) => Promise<NextResponse>
) {
  return async (request: T, routeContext: { params: P }): Promise<NextResponse> => {
    try {
      return await handler(request, routeContext);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

/**
 * 인증 + Rate Limiting이 모두 필요한 Route Handler 래퍼
 *
 * @example
 * ```typescript
 * import { rateLimiters } from '@/lib/rate-limiter';
 *
 * export const POST = withAuthAndRateLimit(
 *   async (request, { session }) => {
 *     return NextResponse.json({ userId: session.user.id });
 *   },
 *   { limiter: rateLimiters.strict }
 * );
 * ```
 */
export function withAuthAndRateLimit<T extends NextRequest = NextRequest, P = Promise<Record<string, string>>>(
  handler: (request: T, context: AuthenticatedContext<P>) => Promise<NextResponse>,
  rateLimitOptions: {
    preset?: 'strict' | 'standard' | 'relaxed' | 'fileUpload';
  } = { preset: 'standard' }
) {
  // Rate limiting을 먼저 적용하고, 그 다음 인증 체크
  const { rateLimit } = require('./api-rate-limit');

  return rateLimit(
    withAuth(handler),
    rateLimitOptions.preset
  );
}
