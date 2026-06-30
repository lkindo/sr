/**
 * Authenticated Route Handler Wrapper
 *
 * API Route Handler에서 반복되는 인증 로직을 제거하기 위한 유틸리티
 */

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import type { AuthenticatedSession } from '@/types/session';

import { handleApiError } from './api-error-handler';
import { rateLimit } from './api-rate-limit';
import { UnauthorizedError } from './errors';

/**
 * 인증된 사용자 정보를 포함하는 컨텍스트
 */
export interface AuthenticatedContext<P = Promise<Record<string, string>>> {
  /**
   * NextAuth 세션 (인증 보장)
   */
  session: AuthenticatedSession;

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
    let actorId: string | undefined;
    try {
      // 인증 확인
      const session = await auth();
      if (!session || !session.user?.id) {
        throw new UnauthorizedError();
      }
      actorId = session.user.id;

      // 타입 안전한 세션으로 변환
      const authenticatedSession: AuthenticatedSession = {
        ...session,
        user: {
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.name,
          image: session.user.image,
          roles: session.user.roles || [],
          permissions: session.user.permissions || [],
          clientIds: session.user.clientIds || [],
        },
      };

      // 인증된 핸들러 실행
      const context: AuthenticatedContext<P> = {
        session: authenticatedSession,
        params: routeContext.params,
      };

      return await handler(request, context);
    } catch (error) {
      // 이미 해석된 세션의 userId를 재사용 (catch에서 auth() 재호출 방지)
      return handleApiError(error, {
        userId: actorId,
        path: request.url,
        method: request.method,
      });
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
export function withErrorHandler<
  T extends NextRequest = NextRequest,
  P = Promise<Record<string, string>>,
>(handler: (request: T, context: { params: P }) => Promise<NextResponse>) {
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
export function withAuthAndRateLimit<
  T extends NextRequest = NextRequest,
  P = Promise<Record<string, string>>,
>(
  handler: (request: T, context: AuthenticatedContext<P>) => Promise<NextResponse>,
  rateLimitOptions: {
    preset?: 'strict' | 'standard' | 'relaxed' | 'fileUpload';
  } = { preset: 'standard' }
) {
  // Rate limiting을 먼저 적용하고, 그 다음 인증 체크
  return rateLimit(withAuth(handler) as any, rateLimitOptions.preset);
}
