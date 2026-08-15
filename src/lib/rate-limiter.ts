/**
 * Rate Limiter Utility
 *
 * 메모리 기반의 토큰 버킷 알고리즘을 사용한 Rate Limiting 구현
 *
 * 상태는 프로세스 로컬이다. 현재 배포는 단일 앱 컨테이너이므로(docker-compose.prod.yml 의
 * `app` 하나, nginx 도 단일 upstream) 이 구현이 전체 트래픽을 정확히 통제한다.
 * **앱을 두 개 이상으로 늘리는 순간 실효 한도가 인스턴스 수만큼 곱해지므로**, 스케일아웃
 * 시점에 공유 저장소(Redis 또는 `sr_sequences` 와 같은 Postgres 원자 연산) 기반으로
 * 바꿔야 한다. 지금 도입하면 실익 없이 인프라만 늘어난다.
 */

import { logger } from './logger';

/**
 * 추적할 최대 버킷 수. 초과하면 만료분을 회수하고, 그래도 넘치면 활성 버킷을 축출한다.
 * 축출은 곧 제한 해제이므로 상한은 넉넉히 잡는다.
 */
const MAX_BUCKETS = 10_000;

/** 축출 시 상한 아래로 더 비워 두는 여유분. 매 신규 키마다 정렬이 도는 것을 막는다. */
const EVICTION_HEADROOM = 500;

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
    };
  }

  /**
   * Rate limit 체크
   * @param key 식별자 (IP, 사용자 ID 등)
   * @param multiplier 이 키에만 적용할 한도 배수. IP 천장 검사가 `preset × 배수` 로
   *   넉넉한 상한을 걸 때 쓴다. 기본 1 이면 프리셋 그대로다.
   * @returns Rate limit 결과
   */
  async check(key: string, multiplier = 1): Promise<RateLimitResult> {
    const now = Date.now();

    // 점진적 수동 청소 실행 (Edge Runtime 등 타이머 미지원 환경 대응)
    this.performIncrementalEviction(now);

    // 배수는 1 미만으로 내려가지 않는다 — 잘못된 환경변수가 한도를 0 으로 만들어
    // 모든 요청을 거부하는(=사실상 장애) 상황을 막는다.
    const limit = Math.max(1, Math.floor(this.config.maxRequests * Math.max(1, multiplier)));

    let bucket = this.buckets.get(key);
    // 버킷이 없거나 윈도우가 만료된 경우 새로 생성
    if (!bucket || now - bucket.lastRefill >= this.config.windowMs) {
      bucket = {
        tokens: limit,
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
    const current = limit - bucket.tokens;
    const remaining = Math.max(0, bucket.tokens);

    return {
      allowed,
      current,
      limit,
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
        if (!randomKey) continue;
        const bucket = this.buckets.get(randomKey);
        if (bucket && now - bucket.lastRefill >= this.config.windowMs) {
          this.buckets.delete(randomKey);
        }
      }
    }

    // 2. 최대 크기 강제 방어 (OOM 방지)
    //
    // 예전에는 크기가 10,000 을 넘으면 **만료 여부를 보지 않고** 삽입 순서로 500개를
    // 지웠다. 소진된 버킷이 지워지면 다음 요청에서 새 버킷이 만들어지며 토큰이 전부
    // 복구되므로, 키를 대량으로 만들 수 있는 쪽은 자기 버킷을 밀어내는 것만으로 strict
    // 제한을 무한히 우회할 수 있었다(감사 4.1). 축출은 그 자체가 제한 해제다.
    //
    // 그래서 순서를 바꾼다. 먼저 만료된 것을 전부 회수하고, 그래도 넘치면 **남은 토큰이
    // 많은 버킷부터** 버린다. 토큰이 남은 버킷은 어차피 다음 요청이 허용되므로 지워도
    // 공격자가 얻는 것이 없다. 반대로 토큰이 0인 버킷을 지우면 그건 곧 제한 해제다.
    // 토큰이 같으면 리셋이 임박한 쪽(lastRefill 이 오래된 쪽)을 먼저 버린다.
    if (this.buckets.size > MAX_BUCKETS) {
      for (const [key, bucket] of this.buckets) {
        if (now - bucket.lastRefill >= this.config.windowMs) {
          this.buckets.delete(key);
        }
      }

      if (this.buckets.size > MAX_BUCKETS) {
        // 상한에 딱 맞추면 이후 모든 신규 키가 다시 정렬을 유발한다. 여유분까지 비운다.
        const target = Math.min(
          this.buckets.size - MAX_BUCKETS + EVICTION_HEADROOM,
          this.buckets.size
        );
        const leastRestricted = Array.from(this.buckets.entries()).sort(
          (a, b) => b[1].tokens - a[1].tokens || a[1].lastRefill - b[1].lastRefill
        );

        let throttledEvicted = 0;
        for (const [key, bucket] of leastRestricted.slice(0, target)) {
          if (bucket.tokens <= 0) throttledEvicted++;
          this.buckets.delete(key);
        }

        // 소진된 버킷까지 버려야 했다면 그만큼은 실제로 제한이 풀린 것이다.
        // 조용히 넘어가면 "용량 부족으로 통제가 사라진" 상태를 아무도 알 수 없다.
        logger.warn('[RateLimiter] 용량 초과로 활성 버킷을 축출했습니다.', {
          evicted: target,
          throttledEvicted,
          capacity: MAX_BUCKETS,
        });
      }
    }
  }

  /** 테스트·운영 관측용. 현재 추적 중인 버킷 수. */
  get size(): number {
    return this.buckets.size;
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
 * 헤더에서 신뢰 가능한 클라이언트 IP를 추출한다.
 *
 * 보안: 클라이언트가 임의로 채울 수 있는 X-Forwarded-For 의 "첫" 항목은 신뢰하지 않는다.
 * 신뢰 가능한 리버스 프록시(nginx)가 설정하는 값만 사용한다.
 *   - X-Real-IP: nginx 가 `$remote_addr`(실제 TCP peer)로 덮어쓰므로 위조 불가 → 최우선.
 *   - X-Forwarded-For: nginx 가 `$proxy_add_x_forwarded_for`로 실제 클라이언트를 "마지막"에
 *     추가하므로 마지막 항목을 사용한다(첫 항목은 클라이언트가 위조 가능하여 사용 금지).
 *
 * 전제: 앱 앞단의 신뢰 프록시가 위 헤더를 신뢰 가능하게 설정한다(nginx.conf 참조).
 */
export function getClientIp(headers: { get(name: string): string | null }): string {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp;
  }

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const parts = forwardedFor
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      // 신뢰 프록시가 추가한 "마지막" 항목이 실제 클라이언트 IP다.
      return parts[parts.length - 1] ?? 'unknown';
    }
  }

  // 기본값 (로컬 개발 환경 / 프록시 미경유)
  return 'unknown';
}

/**
 * Auth.js **v5** 가 실제로 읽는 세션 쿠키 이름. 프로덕션(HTTPS)에서는 `__Secure-` 접두사가 붙는다.
 *
 * v4 호환 이름(`next-auth.session-token`, `__Secure-next-auth.session-token`)은 **의도적으로 뺐다.**
 * Auth.js v5 는 그 이름을 읽지 않으므로 인증에는 아무 영향이 없는데, 아래 파서는 읽고 있었다.
 * 그래서 유효 세션 보유자가
 *
 *     Cookie: next-auth.session-token=<매 요청 난수>; __Secure-authjs.session-token=<진짜 세션>
 *
 * 처럼 보내면 **인증은 정상 성립한 채 버킷만 매 요청 새로 발급**됐다. 읽지 않는 이름을
 * 키 재료로 삼는 것은 순수한 공격 표면이다.
 */
const SESSION_COOKIE_NAMES = ['__Secure-authjs.session-token', 'authjs.session-token'];

/**
 * 세션 키로 잡히는 요청에 **함께** 적용하는 IP 버킷의 배수.
 *
 * 세션 키잉은 NAT 뒤 사무실 전체가 하나의 예산을 나눠 쓰던 문제를 풀기 위한 것이라
 * 되돌릴 수 없다. 하지만 쿠키 값은 서명 검증 없이 쓰이므로(비용 문제로 여기서 검증하지
 * 않는다) 키를 갈아 끼우는 것 자체는 여전히 가능하다.
 *
 * 그래서 IP 버킷을 **넉넉한 배수로** 함께 검사한다. 정상적인 사무실은 이 천장에 닿지 않고,
 * 쿠키를 회전시키는 단일 발신지는 무한이 아니라 `preset × 배수` 에서 멈춘다.
 * 두 버킷 중 하나라도 거부하면 요청은 거부된다.
 */
const SESSION_IP_CEILING_MULTIPLIER = Number(process.env.RATE_LIMIT_IP_CEILING_MULTIPLIER ?? 20);

/** 쿠키 헤더에서 세션 토큰 값을 꺼낸다. 서명 검증은 하지 않는다(키로만 쓴다). */
function getSessionCookieValue(headers: { get(name: string): string | null }): string | null {
  const raw = headers.get('cookie');
  if (!raw) return null;

  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (SESSION_COOKIE_NAMES.includes(name)) {
      const value = part.slice(eq + 1).trim();
      if (value) return value;
    }
  }
  return null;
}

/**
 * 레이트리밋 버킷 키를 만든다.
 *
 * 세션이 있으면 **세션별**로, 없으면 IP 로 키잉한다.
 *
 * 예전에는 항상 IP 였다. `withAuthAndRateLimit` 은 `rateLimit(withAuth(handler))` 로 합성되어
 * 인증 **이전에** 토큰을 소비하므로 세션 사용자 id 를 쓸 수 없었고, 그 결과 NAT 뒤 사무실
 * 전체가 댓글·SR 수정 같은 핵심 쓰기에서 strict 예산(1분 5회)을 공유했다(감사 4.1).
 *
 * 쿠키 값은 그대로 쓰지 않고 해시해 키 길이를 고정한다. **서명 검증은 하지 않는다** —
 * 그래서 이 키만으로는 위조를 막지 못하며, 반드시 `resolveRateLimitKeys` 가 함께 돌려주는
 * IP 천장과 **같이** 검사해야 한다. 이 함수만 단독으로 쓰면 감사에서 지적된
 * "쿠키를 회전시켜 전 제한을 무한 우회" 가 되살아난다.
 *
 * 익명 요청은 그대로 IP 로 묶이므로 로그인 시도 폭주 방어는 영향을 받지 않는다.
 */
export function getClientIdentifier(request: Request): string {
  const session = getSessionCookieValue(request.headers);
  if (session) {
    return `s:${fastHash(session)}`;
  }
  return getClientIp(request.headers);
}

/** `resolveRateLimitKeys` 의 결과. `ceiling` 이 null 이면 IP 천장 검사가 필요 없다. */
export interface RateLimitKeys {
  /** 실제 예산을 소비하는 주 버킷 키. */
  primary: string;
  /**
   * 함께 검사할 IP 천장. 세션 키로 잡힌 요청에만 존재한다.
   * 이미 IP 로 키잉된 익명 요청은 주 버킷이 곧 IP 버킷이므로 중복 검사하지 않는다.
   */
  ceiling: { key: string; multiplier: number } | null;
}

/**
 * 한 요청에 적용할 버킷 키들을 정한다.
 *
 * 세션 쿠키는 클라이언트가 100% 통제하는 값이라 키를 무한히 갈아 끼울 수 있다.
 * 그래서 세션 키로 잡힌 요청에는 **발신 IP 천장을 함께** 건다 — 정상 사무실은 닿지 않고,
 * 쿠키를 회전시키는 단일 발신지는 `preset × 배수` 에서 멈춘다.
 */
export function resolveRateLimitKeys(request: Request): RateLimitKeys {
  const session = getSessionCookieValue(request.headers);
  if (!session) {
    return { primary: getClientIp(request.headers), ceiling: null };
  }
  return {
    primary: `s:${fastHash(session)}`,
    ceiling: {
      key: `ip:${getClientIp(request.headers)}`,
      multiplier: SESSION_IP_CEILING_MULTIPLIER,
    },
  };
}

/** 키 길이를 고정하기 위한 비암호학적 해시(FNV-1a). 보안 용도가 아니다. */
function fastHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
