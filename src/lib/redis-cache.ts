/**
 * Redis 기반 캐싱 서비스
 * Upstash Redis를 사용하여 고성능 캐싱 제공
 * Redis가 설치되지 않아도 동작합니다 (선택적 기능)
 */

// Redis 클라이언트 타입 정의
type RedisClient = {
  get: <T>(key: string) => Promise<T | null>;
  setex: (key: string, seconds: number, value: string) => Promise<string>;
  del: (...keys: string[]) => Promise<number>;
  exists: (key: string) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  scan: (cursor: number, options: { match: string; count: number }) => Promise<[number, string[]]>;
};

// Redis 클라이언트 초기화 (환경 변수가 없으면 null)
let redisClient: RedisClient | null = null;

// 런타임에 Redis 패키지 로드 시도 (빌드 시점에는 체크하지 않음)
function initializeRedis(): RedisClient | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  // 런타임에만 실행 (빌드 시점에는 체크하지 않음)
  if (typeof window !== 'undefined') {
    return null; // 클라이언트 사이드에서는 Redis 사용 안 함
  }

  try {
    // 동적 require로 Redis 패키지 로드 (선택적)
    const RedisModule = require('@upstash/redis') as
      | { Redis?: new (config: { url: string; token: string }) => RedisClient }
      | undefined;
    if (RedisModule?.Redis) {
      return new RedisModule.Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      }) as RedisClient;
    }
  } catch {
    // Redis 패키지가 없거나 초기화 실패 시 무시 (선택적 기능)
    return null;
  }
  return null;
}

// 런타임에만 초기화
redisClient = initializeRedis();

declare global {
  // eslint-disable-next-line no-var
  var __SR_TEST_REDIS__: RedisClient | null | undefined;
}

if (process.env.NODE_ENV === 'test' && typeof globalThis !== 'undefined') {
  const testClient = (globalThis as typeof globalThis & { __SR_TEST_REDIS__?: RedisClient | null })
    .__SR_TEST_REDIS__;
  if (testClient) {
    redisClient = testClient;
  }
}

/**
 * 캐시 키 생성 헬퍼
 */
export const CacheKeys = {
  dashboardStats: (userId?: string) =>
    userId ? `dashboard:stats:${userId}` : 'dashboard:stats:global',
  srList: (params: string) => `sr:list:${params}`,
  srDetail: (srId: string) => `sr:detail:${srId}`,
  clientList: () => 'client:list',
  userList: () => 'user:list',
  userPermissions: (userId: string) => `user:permissions:${userId}`,
  userRoles: (userId: string) => `user:roles:${userId}`,
  roleList: () => 'role:list',
  serviceCategoryList: (clientId?: string) =>
    clientId ? `service-category:list:${clientId}` : 'service-category:list:all',
} as const;

/**
 * 캐시된 데이터 조회 또는 생성
 *
 * @param key - 캐시 키
 * @param fetcher - 데이터를 가져오는 함수
 * @param ttl - Time to Live (초 단위, 기본값: 300초 = 5분)
 * @returns 캐시된 데이터 또는 새로 가져온 데이터
 */
export async function getCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 300
): Promise<T> {
  // Redis가 없으면 직접 fetcher 실행
  if (!redisClient) {
    return fetcher();
  }

  try {
    // 캐시 조회
    const cached = await redisClient.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // 캐시 미스: 데이터 생성
    const data = await fetcher();

    // 캐시 저장 (비동기, 에러가 나도 데이터는 반환)
    redisClient.setex(key, ttl, JSON.stringify(data)).catch(() => {
      // ignore
    });

    return data;
  } catch {
    // 캐시 실패 시 직접 fetcher 실행
    return fetcher();
  }
}

/**
 * 캐시 무효화
 *
 * @param key - 무효화할 캐시 키
 */
export async function invalidateCache(key: string): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.del(key);
  } catch {
    // ignore
  }
}

/**
 * 패턴으로 여러 캐시 무효화
 *
 * @param pattern - 무효화할 캐시 키 패턴 (예: "sr:list:*")
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    // Upstash Redis는 SCAN 명령 지원
    const keys: string[] = [];
    let cursor = 0;

    do {
      const result = await redisClient.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== 0);

    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  } catch {
    // ignore
  }
}

/**
 * 여러 캐시 키 무효화
 *
 * @param keys - 무효화할 캐시 키 배열
 */
export async function invalidateCaches(keys: string[]): Promise<void> {
  if (!redisClient || keys.length === 0) {
    return;
  }

  try {
    await redisClient.del(...keys);
  } catch {
    // ignore
  }
}

export async function invalidateCachePatterns(patterns: string[]): Promise<void> {
  await Promise.all(patterns.map((pattern) => invalidateCachePattern(pattern)));
}

export function scheduleInvalidateCachePatterns(patterns: string[], delayMs = 0) {
  setTimeout(
    () => {
      invalidateCachePatterns(patterns).catch((error) => {
        // ignore
      });
    },
    Math.max(0, delayMs)
  );
}

/**
 * 캐시에 데이터 저장
 *
 * @param key - 캐시 키
 * @param data - 저장할 데이터
 * @param ttl - Time to Live (초 단위, 기본값: 300초 = 5분)
 */
export async function setCache<T>(key: string, data: T, ttl: number = 300): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.setex(key, ttl, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * 캐시에서 데이터 조회
 *
 * @param key - 캐시 키
 * @returns 캐시된 데이터 또는 null
 */
export async function getCache<T>(key: string): Promise<T | null> {
  if (!redisClient) {
    return null;
  }

  try {
    return await redisClient.get<T>(key);
  } catch (error) {
    return null;
  }
}

/**
 * 캐시 존재 여부 확인
 *
 * @param key - 캐시 키
 * @returns 존재 여부
 */
export async function existsCache(key: string): Promise<boolean> {
  if (!redisClient) {
    return false;
  }

  try {
    const result = await redisClient.exists(key);
    return result === 1;
  } catch (error) {
    return false;
  }
}

/**
 * 캐시 TTL 조회
 *
 * @param key - 캐시 키
 * @returns TTL (초) 또는 -1 (만료 없음), -2 (키 없음)
 */
export async function getCacheTTL(key: string): Promise<number> {
  if (!redisClient) {
    return -2;
  }

  try {
    return await redisClient.ttl(key);
  } catch (error) {
    return -2;
  }
}
