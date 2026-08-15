import { NextRequest, NextResponse } from 'next/server';

import {
  MemoryRateLimiter,
  rateLimiters,
  RateLimitResult,
  resolveRateLimitKeys,
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
 * (프로덕션은 rateLimit({limiter}) 만 사용, 나머지 옵션은 __tests__/api-rate-limit.test.ts:107,154,182,209 전용)
 */
export function withRateLimit<
  T extends NextRequest = NextRequest,
  P = Promise<Record<string, string>>,
>(handler: (req: T, context: { params: P }) => Promise<NextResponse>, options: RateLimitOptions) {
  const { limiter, includeHeaders = true, keyGenerator, onRateLimitExceeded } = options;

  return async (req: T, context: { params: P }): Promise<NextResponse> => {
    // 테스트 환경에서는 제한 비활성화 (환경 변수로 제어 가능)
    if (process.env.NODE_ENV === 'test' && process.env.TEST_MODE !== 'true') {
      return handler(req, context);
    }

    /**
     * 키가 두 개인 이유 (감사 D-1).
     *
     * 주 버킷은 세션별이라 NAT 뒤 사무실이 예산을 나눠 쓰지 않는다. 그런데 세션 쿠키 값은
     * 서명 검증 없이 쓰이므로 **클라이언트가 키를 무한히 갈아 끼울 수 있다** — 유효 계정
     * 하나로 CSV 내보내기(5만 행 스캔)와 첨부 업로드(50MB)의 제한을 통째로 우회할 수 있었다.
     *
     * 그래서 세션 키로 잡힌 요청에는 발신 IP 천장을 **함께** 건다. 둘 중 하나라도 거부하면
     * 요청은 거부된다. 정상 사무실은 천장(= preset × 배수)에 닿지 않고, 쿠키를 회전시키는
     * 단일 발신지는 무한이 아니라 그 천장에서 멈춘다.
     *
     * `keyGenerator` 를 넘기면(테스트 전용) 천장 검사는 건너뛴다.
     */
    let result: RateLimitResult;
    if (keyGenerator) {
      result = await limiter.check(keyGenerator(req));
    } else {
      const keys = resolveRateLimitKeys(req);
      result = await limiter.check(keys.primary);
      if (result.allowed && keys.ceiling) {
        const ceiling = await limiter.check(keys.ceiling.key, keys.ceiling.multiplier);
        // 천장에 걸리면 그 결과를 그대로 돌려준다 — 남은 토큰·리셋 시각이 실제로
        // 요청을 막고 있는 쪽의 값이어야 클라이언트가 언제 재시도할지 알 수 있다.
        if (!ceiling.allowed) result = ceiling;
      }
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
