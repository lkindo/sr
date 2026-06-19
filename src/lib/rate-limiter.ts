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

    // 점진적 수동 청소 실행 (Edge Runtime 등 타이머 미지원 환경 대응)
    this.performIncrementalEviction(now);

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
   * 점진적 만료 데이터 정리 및 임계치 도달 시 강제 방출
   */
  private performIncrementalEviction(now: number): void {
    // 1. O(1) 랜덤 샘플링 축출 (Random Sampling Eviction)
    // 매 호출 시 10% 확률로 임의의 5개 샘플을 추출해 만료 상태인 것만 지워 O(1) 수준으로 성능 저하를 방지합니다.
    if (Math.random() < 0.1 && this.buckets.size > 0) {
      const keys = Array.from(this.buckets.keys());
      const sampleSize = Math.min(5, keys.length);
      for (let i = 0; i < sampleSize; i++) {
        const randomIndex = Math.floor(Math.random() * keys.length);
        const randomKey = keys[randomIndex];
        const bucket = this.buckets.get(randomKey);
        if (bucket && now - bucket.lastRefill >= this.config.windowMs) {
          this.buckets.delete(randomKey);
        }
      }
    }

    // 2. 최대 크기 강제 방어 (OOM 방지 FIFO Eviction)
    // 버킷 맵 크기가 임계치(10,000개)를 초과하면, 가장 오래전에 등록된 500개 항목을 맵에서 강제 방출(FIFO)합니다.
    if (this.buckets.size > 10000) {
      const iterator = this.buckets.keys();
      for (let i = 0; i < 500; i++) {
        const next = iterator.next();
        if (next.done) break;
        this.buckets.delete(next.value);
      }
    }
  }

  /**
   * 오래된 버킷 정리 (Edge Runtime 타이머 미작동 및 메모리 누수 대응)
   * performIncrementalEviction 수동 청소로 일괄 통제하므로 setInterval 타이머는 폐지합니다.
   */
  private startCleanup(): void {
    // performIncrementalEviction에서 점진적으로 만료 처리를 하여 메모리를 회수하므로 타이머를 가동하지 않습니다.
    return;
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
  MIDDLEWARE: getEnvRateLimitConfig('MIDDLEWARE', 60 * 1000, 100),
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
