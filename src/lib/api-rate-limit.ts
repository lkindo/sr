import { NextRequest, NextResponse } from 'next/server';

import {
  ipRateLimitKeys,
  MemoryRateLimiter,
  rateLimiters,
  type RateLimitKeys,
  RateLimitResult,
} from './rate-limiter';

export interface RateLimitOptions {
  limiter: MemoryRateLimiter;
  includeHeaders?: boolean; // Default: true
  keyGenerator?: (req: NextRequest) => string;
  /** 버킷 키를 정한다. 없으면 발신 IP 로만 제한한다. */
  resolveKeys?: (req: NextRequest) => RateLimitKeys;
  onRateLimitExceeded?: (
    req: NextRequest,
    context: { params: any },
    result: RateLimitResult
  ) => Promise<NextResponse>;
}

/**
 * Route Handler에 Rate Limit 적용
 * (프로덕션은 rateLimit({limiter}) 만 사용, 나머지 옵션은 __tests__/api-rate-limit.test.ts:107,154,182,209 전용)
 */
export function withRateLimit<
  T extends NextRequest = NextRequest,
  P = Promise<Record<string, string>>,
>(handler: (req: T, context: { params: P }) => Promise<NextResponse>, options: RateLimitOptions) {
  const {
    limiter,
    includeHeaders = true,
    keyGenerator,
    resolveKeys,
    onRateLimitExceeded,
  } = options;

  return async (req: T, context: { params: P }): Promise<NextResponse> => {
    // 테스트 환경에서는 제한 비활성화 (환경 변수로 제어 가능)
    if (process.env.NODE_ENV === 'test' && process.env.TEST_MODE !== 'true') {
      return handler(req, context);
    }

    // `keyGenerator` 는 테스트 전용이라 천장을 검사하지 않는다.
    const keys: RateLimitKeys = keyGenerator
      ? { primary: keyGenerator(req), ceiling: null }
      : resolveKeys
        ? resolveKeys(req)
        : ipRateLimitKeys(req.headers);

    let result = await limiter.check(keys.primary);
    if (result.allowed && keys.ceiling) {
      const ceiling = await limiter.check(keys.ceiling.key, keys.ceiling.multiplier);
      // 천장에 걸리면 그 결과를 그대로 돌려준다. 남은 횟수와 리셋 시각은
      // 요청을 막고 있는 쪽의 값이어야 클라이언트가 언제 재시도할지 알 수 있다.
      if (!ceiling.allowed) result = ceiling;
    }

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
