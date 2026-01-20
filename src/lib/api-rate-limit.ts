import { NextRequest, NextResponse } from 'next/server';

import {
  getClientIdentifier,
  MemoryRateLimiter,
  rateLimiters,
  RateLimitResult,
} from './rate-limiter';

export interface RateLimitOptions {
  limiter: MemoryRateLimiter;
  includeHeaders?: boolean; // Default: true
  keyGenerator?: (req: NextRequest) => string;
  onRateLimitExceeded?: (
    req: NextRequest,
    context: { params: any },
    result: RateLimitResult
  ) => Promise<NextResponse>;
}

/**
 * Route Handler에 Rate Limit 적용
 */
export function withRateLimit<
  T extends NextRequest = NextRequest,
  P = Promise<Record<string, string>>,
>(handler: (req: T, context: { params: P }) => Promise<NextResponse>, options: RateLimitOptions) {
  const {
    limiter,
    includeHeaders = true,
    keyGenerator = getClientIdentifier,
    onRateLimitExceeded,
  } = options;

  return async (req: T, context: { params: P }): Promise<NextResponse> => {
    // 테스트 환경에서는 제한 비활성화 (환경 변수로 제어 가능)
    if (process.env.NODE_ENV === 'test' && process.env.TEST_MODE !== 'true') {
      return handler(req, context);
    }

    const key = keyGenerator(req);
    const result = await limiter.check(key);

    const headers = new Headers();
    if (includeHeaders) {
      headers.set('X-RateLimit-Limit', result.limit.toString());
      headers.set('X-RateLimit-Remaining', result.remaining.toString());
      headers.set('X-RateLimit-Reset', result.resetTime.toString());
    }

    if (!result.allowed) {
      if (includeHeaders) {
        headers.set('Retry-After', Math.ceil(result.resetTime / 1000).toString());
      }

      if (onRateLimitExceeded) {
        return onRateLimitExceeded(req, context, result);
      }

      return NextResponse.json(
        {
          error: 'Too Many Requests',
          limit: result.limit,
          remaining: result.remaining,
          reset: result.resetTime,
        },
        { status: 429, headers }
      );
    }

    const response = await handler(req, context);

    // 성공 응답에도 헤더 추가
    if (includeHeaders) {
      // NextResponse 헤더는 불변일 수 있으므로 clone하거나 반복해서 추가
      response.headers.set('X-RateLimit-Limit', result.limit.toString());
      response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
      response.headers.set('X-RateLimit-Reset', result.resetTime.toString());
    }

    return response;
  };
}

/**
 * 프리셋을 사용하는 간편한 rateLimit 래퍼
 */
export function rateLimit<T extends NextRequest = NextRequest, P = Promise<Record<string, string>>>(
  handler: (req: T, context: { params: P }) => Promise<NextResponse>,
  preset: 'strict' | 'standard' | 'relaxed' | 'fileUpload' = 'standard'
) {
  const limiter = rateLimiters[preset];
  return withRateLimit(handler, { limiter });
}
