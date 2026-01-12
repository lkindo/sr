/**
 * API Rate Limiting Middleware
 *
 * Next.js API Routes에서 사용하는 Rate Limiting 미들웨어
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  MemoryRateLimiter,
  RateLimitResult,
  getClientIdentifier,
  rateLimiters,
} from './rate-limiter';

/**
 * Rate Limit 에러 응답
 */
export class RateLimitError extends Error {
  constructor(
    public result: RateLimitResult,
    message?: string
  ) {
    super(message || 'Too many requests');
    this.name = 'RateLimitError';
  }
}

/**
 * Rate Limit 미들웨어 옵션
 */
export interface RateLimitMiddlewareOptions {
  /**
   * Rate Limiter 인스턴스
   */
  limiter: MemoryRateLimiter;

  /**
   * 식별자 추출 함수
   * @default IP 주소 기반
   */
  keyGenerator?: (request: NextRequest) => string | Promise<string>;

  /**
   * Rate limit 초과 시 커스텀 응답
   */
  onRateLimitExceeded?: (
    request: NextRequest,
    result: RateLimitResult
  ) => NextResponse | Promise<NextResponse>;

  /**
   * 응답에 Rate Limit 헤더 추가
   * @default true
   */
  includeHeaders?: boolean;
}

/**
 * Rate Limit 헤더 추가
 */
function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set('X-RateLimit-Limit', result.limit.toString());
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  response.headers.set('X-RateLimit-Reset', new Date(Date.now() + result.resetTime).toISOString());

  // Rate limit 초과 시 Retry-After 헤더 추가
  if (!result.allowed) {
    response.headers.set('Retry-After', Math.ceil(result.resetTime / 1000).toString());
  }

  return response;
}

/**
 * Next.js API Route Handler용 Rate Limiting 래퍼
 *
 * @example
 * ```typescript
 * import { withRateLimit } from '@/lib/api-rate-limit';
 * import { rateLimiters } from '@/lib/rate-limiter';
 *
 * export const POST = withRateLimit(
 *   async (req) => {
 *     // API 로직
 *     return NextResponse.json({ success: true });
 *   },
 *   { limiter: rateLimiters.strict }
 * );
 * ```
 */
export function withRateLimit<T extends NextRequest = NextRequest, P = Promise<Record<string, string>>>(
  handler: (request: T, context: { params: P }) => Promise<NextResponse>,
  options: RateLimitMiddlewareOptions
) {
  return async (
    request: T,
    context: { params: P }
  ): Promise<NextResponse> => {
    const {
      limiter,
      keyGenerator = getClientIdentifier,
      onRateLimitExceeded,
      includeHeaders = true,
    } = options;

    // 식별자 추출
    const key = await Promise.resolve(keyGenerator(request));

    // Rate limit 체크
    const result = await limiter.check(key);

    // Rate limit 초과
    if (!result.allowed) {
      let response: NextResponse;

      if (onRateLimitExceeded) {
        response = await onRateLimitExceeded(request, result);
      } else {
        // 기본 응답
        response = NextResponse.json(
          {
            error: 'Too Many Requests',
            message: `요청 한도를 초과했습니다. ${Math.ceil(result.resetTime / 1000)}초 후 다시 시도해주세요.`,
            limit: result.limit,
            remaining: result.remaining,
            resetTime: new Date(Date.now() + result.resetTime).toISOString(),
          },
          { status: 429 }
        );
      }

      if (includeHeaders) {
        addRateLimitHeaders(response, result);
      }

      return response;
    }

    // 핸들러 실행
    const response = await handler(request, context);

    // Rate limit 헤더 추가
    if (includeHeaders) {
      addRateLimitHeaders(response, result);
    }

    return response;
  };
}

/**
 * Route Handler 타입용 Rate Limiting 래퍼 (간편 버전)
 *
 * @example
 * ```typescript
 * export const POST = rateLimit(async (req) => {
 *   return NextResponse.json({ success: true });
 * }, 'strict'); // 'strict' | 'standard' | 'relaxed' | 'fileUpload'
 * ```
 */
export function rateLimit<T extends NextRequest = NextRequest, P = Promise<Record<string, string>>>(
  handler: (request: T, context: { params: P }) => Promise<NextResponse>,
  preset: 'strict' | 'standard' | 'relaxed' | 'fileUpload' = 'standard'
) {
  return withRateLimit<T, P>(handler, {
    limiter: rateLimiters[preset],
  });
}

/**
 * 사용자 ID 기반 Rate Limiting (인증된 요청용)
 *
 * @example
 * ```typescript
 * export const POST = withUserRateLimit(
 *   async (req) => {
 *     const session = await getServerSession(authOptions);
 *     return NextResponse.json({ userId: session?.user?.id });
 *   },
 *   { limiter: rateLimiters.standard }
 * );
 * ```
 */
export function withUserRateLimit<T extends NextRequest = NextRequest, P = Promise<Record<string, string>>>(
  handler: (request: T, context: { params: P }) => Promise<NextResponse>,
  options: Omit<RateLimitMiddlewareOptions, 'keyGenerator'> & {
    getUserId?: (request: T) => Promise<string | null>;
  }
) {
  const { getUserId, ...restOptions } = options;

  return withRateLimit(handler, {
    ...restOptions,
    keyGenerator: async (request: NextRequest) => {
      if (getUserId) {
        const userId = await getUserId(request as T);
        if (userId) return `user:${userId}`;
      }

      // 인증되지 않은 경우 IP 기반
      return `ip:${getClientIdentifier(request)}`;
    },
  });
}
