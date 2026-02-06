/**
 * Rate Limiter Utility
 *
 * 메모리 기반의 토큰 버킷 알고리즘을 사용한 Rate Limiting 구현
 */

import { logger } from '@/lib/logger';

export interface RateLimitConfig {
  /**
   * 시간 윈도우 (밀리초)
   * @default 60000 (1분)
   */
  windowMs: number;

  /**
   * 윈도우당 최대 요청 수
   * @default 100
   */
  maxRequests: number;

  /**
   * 스킵 성공 응답 (2xx)
   * @default false
   */
  skipSuccessfulRequests?: boolean;

  /**
   * 스킵 실패 응답 (4xx, 5xx)
   * @default false
   */
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  /**
   * 요청 허용 여부
   */
  allowed: boolean;

  /**
   * 현재 윈도우에서 사용한 요청 수
   */
  current: number;

  /**
   * 윈도우당 최대 요청 수
   */
  limit: number;

  /**
   * 윈도우 리셋까지 남은 시간 (밀리초)
   */
  resetTime: number;

  /**
   * 남은 요청 수
   */
  remaining: number;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * 메모리 기반 Rate Limiter
 */
export class MemoryRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      skipSuccessfulRequests: config.skipSuccessfulRequests ?? false,
      skipFailedRequests: config.skipFailedRequests ?? false,
    };

    // 주기적으로 오래된 버킷 정리 (메모리 누수 방지)
    this.startCleanup();
  }

  /**
   * Rate limit 체크
   * @param key 식별자 (IP, 사용자 ID 등)
   * @returns Rate limit 결과
   */
  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    // 버킷이 없거나 윈도우가 만료된 경우 새로 생성
    if (!bucket || now - bucket.lastRefill >= this.config.windowMs) {
      bucket = {
        tokens: this.config.maxRequests,
        lastRefill: now,
      };
      this.buckets.set(key, bucket);
    }

    // 요청 허용 여부 결정
    const allowed = bucket.tokens > 0;

    if (allowed) {
      bucket.tokens--;
    }

    const resetTime = this.config.windowMs - (now - bucket.lastRefill);
    const current = this.config.maxRequests - bucket.tokens;
    const remaining = Math.max(0, bucket.tokens);

    return {
      allowed,
      current,
      limit: this.config.maxRequests,
      resetTime,
      remaining,
    };
  }

  /**
   * 특정 키의 rate limit 리셋
   * @param key 식별자
   */
  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  /**
   * 모든 rate limit 리셋
   */
  async resetAll(): Promise<void> {
    this.buckets.clear();
  }

  /**
   * 오래된 버킷 정리
   */
  private startCleanup(): void {
    // Edge Runtime에서는 setInterval이 모듈 초기화 단계에서 허용되지 않음
    if (process.env.NEXT_RUNTIME === 'edge') {
      return;
    }

    // 5분마다 윈도우가 지난 버킷 삭제
    setInterval(
      () => {
        const now = Date.now();
        const keysToDelete: string[] = [];

        this.buckets.forEach((bucket, key) => {
          if (now - bucket.lastRefill >= this.config.windowMs * 2) {
            keysToDelete.push(key);
          }
        });

        keysToDelete.forEach((key) => this.buckets.delete(key));

        if (keysToDelete.length > 0 && process.env.NODE_ENV === 'development') {
          // 개발 환경에서만 정리 로그 출력
          logger.info(`[RateLimiter] Cleaned up ${keysToDelete.length} expired buckets`);
        }
      },
      5 * 60 * 1000
    ); // 5분
  }
}

/**
 * 환경 변수에서 Rate Limit 설정 읽기
 */
function getEnvRateLimitConfig(
  prefix: string,
  defaultWindowMs: number,
  defaultMaxRequests: number
): RateLimitConfig {
  const windowMsEnv = process.env[`RATE_LIMIT_${prefix}_WINDOW_MS`];
  const windowMs = windowMsEnv ? parseInt(windowMsEnv, 10) : defaultWindowMs;

  const maxRequestsEnv = process.env[`RATE_LIMIT_${prefix}_MAX_REQUESTS`];
  const maxRequests = maxRequestsEnv ? parseInt(maxRequestsEnv, 10) : defaultMaxRequests;

  return { windowMs, maxRequests };
}

/**
 * Rate Limiter 프리셋
 * 환경 변수로 설정 가능, 미설정 시 기본값 사용
 */
export const RateLimitPresets = {
  /**
   * 엄격한 제한 (로그인, 회원가입 등)
   * 기본: 1분당 5회
   * 환경 변수: RATE_LIMIT_STRICT_WINDOW_MS, RATE_LIMIT_STRICT_MAX_REQUESTS
   */
  STRICT: getEnvRateLimitConfig('STRICT', 60 * 1000, 5),

  /**
   * 일반 API 제한
   * 기본: 1분당 100회
   * 환경 변수: RATE_LIMIT_STANDARD_WINDOW_MS, RATE_LIMIT_STANDARD_MAX_REQUESTS
   */
  STANDARD: getEnvRateLimitConfig('STANDARD', 60 * 1000, 100),

  /**
   * 느슨한 제한 (읽기 전용 API)
   * 기본: 1분당 300회
   * 환경 변수: RATE_LIMIT_RELAXED_WINDOW_MS, RATE_LIMIT_RELAXED_MAX_REQUESTS
   */
  RELAXED: getEnvRateLimitConfig('RELAXED', 60 * 1000, 300),

  /**
   * 파일 업로드 제한
   * 기본: 1시간당 20회
   * 환경 변수: RATE_LIMIT_FILE_UPLOAD_WINDOW_MS, RATE_LIMIT_FILE_UPLOAD_MAX_REQUESTS
   */
  FILE_UPLOAD: getEnvRateLimitConfig('FILE_UPLOAD', 60 * 60 * 1000, 20),

  /**
   * 미들웨어 (API 전체) 제한
   * 기본: 1분당 20회
   * 환경 변수: RATE_LIMIT_MIDDLEWARE_WINDOW_MS, RATE_LIMIT_MIDDLEWARE_MAX_REQUESTS
   */
  MIDDLEWARE: getEnvRateLimitConfig('MIDDLEWARE', 60 * 1000, 20),
};

/**
 * 싱글톤 Rate Limiter 인스턴스들
 */
export const rateLimiters = {
  strict: new MemoryRateLimiter(RateLimitPresets.STRICT),
  standard: new MemoryRateLimiter(RateLimitPresets.STANDARD),
  relaxed: new MemoryRateLimiter(RateLimitPresets.RELAXED),
  fileUpload: new MemoryRateLimiter(RateLimitPresets.FILE_UPLOAD),
  middleware: new MemoryRateLimiter(RateLimitPresets.MIDDLEWARE),
};

/**
 * IP 주소 추출 헬퍼 (Next.js Request)
 */
export function getClientIdentifier(request: Request): string {
  // 1. X-Forwarded-For 헤더 확인 (프록시 뒤에 있을 경우)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // 2. X-Real-IP 헤더 확인
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // 3. 기본값 (로컬 개발 환경)
  return 'unknown';
}
