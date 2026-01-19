/**
 * Redis 기반 캐싱 서비스 (Stubbed - Redis Removed)
 * Redis 의존성이 제거되어 모든 요청을 캐시 미스로 처리합니다.
 */

// Redis 클라이언트 타입 정의 (No-op용)
type RedisClient = {
  get: <T>(key: string) => Promise<T | null>;
  setex: (key: string, seconds: number, value: string) => Promise<string>;
  del: (...keys: string[]) => Promise<number>;
  exists: (key: string) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  scan: (cursor: number, options: { match: string; count: number }) => Promise<[number, string[]]>;
};

// 항상 null 반환
const redisClient: RedisClient | null = null;

declare global {
  // eslint-disable-next-line no-var
  var __SR_TEST_REDIS__: RedisClient | null | undefined;
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
 */
export async function getCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 300
): Promise<T> {
  // 항상 fetcher 실행
  return fetcher();
}

/**
 * 캐시 무효화 (No-op)
 */
export async function invalidateCache(key: string): Promise<void> {
  return;
}

/**
 * 패턴으로 여러 캐시 무효화 (No-op)
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  return;
}

/**
 * 여러 캐시 키 무효화 (No-op)
 */
export async function invalidateCaches(keys: string[]): Promise<void> {
  return;
}

export async function invalidateCachePatterns(patterns: string[]): Promise<void> {
  return;
}

export function scheduleInvalidateCachePatterns(patterns: string[], delayMs = 0) {
  return;
}

/**
 * 캐시에 데이터 저장 (No-op)
 */
export async function setCache<T>(key: string, data: T, ttl: number = 300): Promise<void> {
  return;
}

/**
 * 캐시에서 데이터 조회 (No-op)
 */
export async function getCache<T>(key: string): Promise<T | null> {
  return null;
}

/**
 * 캐시 존재 여부 확인 (No-op)
 */
export async function existsCache(key: string): Promise<boolean> {
  return false;
}

/**
 * 캐시 TTL 조회 (No-op)
 */
export async function getCacheTTL(key: string): Promise<number> {
  return -2;
}
