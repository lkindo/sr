import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RedisStore = {
  values: Map<string, string>;
};

const createRedisClient = (store: RedisStore) => ({
  async get<T>(key: string): Promise<T | null> {
    const raw = store.values.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  },
  async setex(key: string, _seconds: number, value: string) {
    store.values.set(key, value);
    return 'OK';
  },
  async del(...keys: string[]) {
    let removed = 0;
    for (const key of keys) {
      if (store.values.delete(key)) {
        removed++;
      }
    }
    return removed;
  },
  async exists(key: string) {
    return store.values.has(key) ? 1 : 0;
  },
  async ttl(key: string) {
    return store.values.has(key) ? 60 : -2;
  },
  async scan(
    _cursor: number,
    { match }: { match: string; count: number }
  ): Promise<[number, string[]]> {
    const regex = new RegExp('^' + match.replace(/\*/g, '.*') + '$');
    const keys = Array.from(store.values.keys()).filter((key) => regex.test(key));
    return [0, keys];
  },
});

async function loadRedisCache() {
  const store: RedisStore = { values: new Map() };
  // 1. Clear any previously cached module
  vi.resetModules();
  // 2. Ensure NODE_ENV is 'test' for the module initialization check
  vi.stubEnv('NODE_ENV', 'test');
  // 3. Set the global mock client (the fresh import will see this)
  (globalThis as typeof globalThis & { __SR_TEST_REDIS__?: any }).__SR_TEST_REDIS__ =
    createRedisClient(store) as any;
  // 4. Import the module - it will now see __SR_TEST_REDIS__ during initialization
  const mod = await import('@/lib/redis-cache');
  return { cache: mod, store };
}

describe('redis-cache integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    delete (globalThis as typeof globalThis & { __SR_TEST_REDIS__?: any }).__SR_TEST_REDIS__;
    vi.useRealTimers();
  });

  it('getCachedData는 캐시에 값을 저장하고 재사용한다', async () => {
    const { cache } = await loadRedisCache();
    const fetcher = vi.fn().mockResolvedValue({ count: 1 });

    const first = await cache.getCachedData('stats:test', fetcher, 60);
    expect(first).toEqual({ count: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await cache.getCachedData('stats:test', fetcher, 60);
    expect(second).toEqual({ count: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('invalidateCachePattern은 패턴에 맞는 키를 제거한다', async () => {
    const { cache } = await loadRedisCache();

    await cache.setCache('sr:list:open', { ids: [1] });
    await cache.setCache('sr:list:closed', { ids: [2] });
    await cache.setCache('user:list', { ids: [3] });

    await cache.invalidateCachePattern('sr:list:*');

    const srCache = await cache.getCache<{ ids: number[] }>('sr:list:open');
    const userCache = await cache.getCache<{ ids: number[] }>('user:list');

    expect(srCache).toBeNull();
    expect(userCache).not.toBeNull();
  });

  it('scheduleInvalidateCachePatterns는 지연 후 패턴을 무효화한다', async () => {
    const { cache } = await loadRedisCache();
    await cache.setCache('sr:list:open', { ids: [1] });

    cache.scheduleInvalidateCachePatterns(['sr:list:*'], 1000);
    await vi.advanceTimersByTimeAsync(1000);

    const srCache = await cache.getCache('sr:list:open');
    expect(srCache).toBeNull();
  });
});
