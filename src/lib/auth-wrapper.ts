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
import { logger } from './logger';

/**
 * 한 요청의 소요 시간을 재고 `logger.logRequest` 로 남긴다 (be-rules §1).
 *
 * **계측은 여기 한 곳에서만 한다.** 예전 규칙은 "모든 라우트가 각자 Pino 로 소요 시간을
 * 로깅한다" 였는데 38개 라우트 전부에서 미준수였고, `logger.logRequest` 는 프로덕션 호출이
 * 0건이었다. 라우트마다 붙이는 방식은 새 라우트가 생길 때마다 다시 빠진다 —
 * 래퍼를 경유하는 것이 이미 강제되므로 계측도 래퍼가 맡는 것이 유일하게 지켜지는 형태다.
 *
 * 실패 경로도 계측한다. 느려서 터지는 요청이야말로 소요 시간이 필요한 쪽이다.
 */
/** 행위자 참조. 인증은 `run` 안에서 끝나므로 계측이 나중에 읽을 수 있게 가변 홀더로 넘긴다. */
interface ActorRef {
  id?: string;
}

async function instrument(
  request: { method: string; url: string },
  actor: ActorRef,
  run: () => Promise<NextResponse>
): Promise<NextResponse> {
  const startedAt = Date.now();
  let status = 500;
  try {
    const response = await run();
    status = response.status;
    return response;
  } finally {
    logger.logRequest(request.method, request.url, status, Date.now() - startedAt, {
      userId: actor.id,
    });
  }
}

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
    const actor: ActorRef = {};

    // 계측은 인증 실패·에러 응답까지 포함해야 한다 — 느려서 터지는 요청이야말로
    // 소요 시간이 필요한 쪽이므로 try 바깥에서 감싼다.
    return instrument(request, actor, async () => {
      try {
        // 인증 확인
        const session = await auth();
        if (!session || !session.user?.id) {
          throw new UnauthorizedError();
        }
        actor.id = session.user.id;

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
          userId: actor.id,
          path: request.url,
          method: request.method,
        });
      }
    });
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
    // 인증이 없는 경로도 계측 대상이다(be-rules §1 — 예외를 두지 않는다).
    return instrument(request, {}, async () => {
      try {
        return await handler(request, routeContext);
      } catch (error) {
        return handleApiError(error);
      }
    });
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
