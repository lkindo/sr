/**
 * Redis 기반 Rate Limiter
 *
 * Upstash Redis를 사용하여 분산 환경에서도 일관된 Rate Limiting 제공
 * - Vercel 서버리스 환경에서 여러 인스턴스 간 공유
 * - Sliding Window 알고리즘 사용
 * - 자동 만료 (TTL)
 */

import { Redis } from '@upstash/redis';

export interface RateLimiterConfig {
  /**
   * 시간 윈도우 (밀리초)
   * @default 60000 (1분)
   */
  windowMs: number;

  /**
   * 윈도우 내 최대 요청 수
   * @default 100
   */
  maxRequests: number;
}

export interface RateLimiter {
  /**
   * Rate Limit 체크
   * @param identifier - 사용자/IP 식별자
   * @returns 허용 여부
   */
  checkLimit(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
  }>;
}

/**
 * Redis 기반 Rate Limiter 구현
 */
export class RedisRateLimiter implements RateLimiter {
  private redis: Redis;
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;

    // Upstash Redis 클라이언트 초기화
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set for Redis Rate Limiter'
      );
    }

    this.redis = new Redis({
      url,
      token,
    });
  }

  /**
   * Rate Limit 체크
   *
   * Sliding Window 알고리즘:
   * 1. 현재 타임스탬프 기준으로 window 이전의 요청은 제거
   * 2. 남은 요청 수 카운트
   * 3. 한도 초과 여부 확인
   * 4. 새 요청 추가
   */
  async checkLimit(identifier: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
  }> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const key = `rate-limit:${identifier}`;

    try {
      // Lua 스크립트로 원자적 실행 (Race Condition 방지)
      const result = await this.redis.eval(
        `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window_start = tonumber(ARGV[2])
        local max_requests = tonumber(ARGV[3])
        local window_ms = tonumber(ARGV[4])

        -- 윈도우 밖의 오래된 요청 제거
        redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

        -- 현재 요청 수 카운트
        local count = redis.call('ZCARD', key)

        -- TTL 설정 (윈도우 크기 + 여유)
        local ttl_seconds = math.ceil(window_ms / 1000) + 10
        redis.call('EXPIRE', key, ttl_seconds)

        if count < max_requests then
          -- 허용: 새 요청 추가
          redis.call('ZADD', key, now, now)
          return {1, max_requests - count - 1, window_start + window_ms}
        else
          -- 거부: 가장 오래된 요청의 리셋 시간 반환
          local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
          local reset_at = tonumber(oldest[2]) + window_ms
          return {0, 0, reset_at}
        end
        `,
        [key], // KEYS
        [
          now.toString(),
          windowStart.toString(),
          this.config.maxRequests.toString(),
          this.config.windowMs.toString(),
        ] // ARGV
      ) as [number, number, number];

      const [allowed, remaining, resetAtTimestamp] = result;

      return {
        allowed: allowed === 1,
        remaining,
        resetAt: new Date(resetAtTimestamp),
      };
    } catch (error) {
      // Redis 오류 시 요청 허용 (Fail-open)
      console.error('Redis Rate Limiter error:', error);
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: new Date(now + this.config.windowMs),
      };
    }
  }

  /**
   * 특정 사용자의 Rate Limit 리셋
   * @param identifier - 사용자/IP 식별자
   */
  async reset(identifier: string): Promise<void> {
    const key = `rate-limit:${identifier}`;
    await this.redis.del(key);
  }

  /**
   * Rate Limiter 상태 조회 (디버깅용)
   */
  async getStatus(identifier: string): Promise<{
    count: number;
    remaining: number;
    oldestRequest: Date | null;
  }> {
    const key = `rate-limit:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // 오래된 요청 제거
    await this.redis.zremrangebyscore(key, 0, windowStart);

    // 현재 요청 수
    const count = await this.redis.zcard(key);

    // 가장 오래된 요청 시간
    const oldest = await this.redis.zrange<Array<{ score: number; value: string }>>(key, 0, 0, { withScores: true });
    const oldestRequest = oldest.length > 0 && typeof oldest[0] === 'object' && 'score' in oldest[0]
      ? new Date(oldest[0].score)
      : null;

    return {
      count,
      remaining: Math.max(0, this.config.maxRequests - count),
      oldestRequest,
    };
  }
}

/**
 * Rate Limiter 프리셋
 */
export const RateLimiterPresets = {
  /**
   * Strict: 로그인, 회원가입 등 민감한 작업
   * 1분당 5회
   */
  strict: new RedisRateLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_STRICT_WINDOW_MS || '60000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_STRICT_MAX_REQUESTS || '5'),
  }),

  /**
   * Standard: 일반 API (POST, PUT, DELETE)
   * 1분당 100회
   */
  standard: new RedisRateLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_STANDARD_WINDOW_MS || '60000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_STANDARD_MAX_REQUESTS || '100'),
  }),

  /**
   * Relaxed: 읽기 전용 API (GET)
   * 1분당 300회
   */
  relaxed: new RedisRateLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_RELAXED_WINDOW_MS || '60000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_RELAXED_MAX_REQUESTS || '300'),
  }),

  /**
   * File Upload: 파일 업로드
   * 1시간당 20회
   */
  fileUpload: new RedisRateLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_FILE_UPLOAD_WINDOW_MS || '3600000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_FILE_UPLOAD_MAX_REQUESTS || '20'),
  }),
};
