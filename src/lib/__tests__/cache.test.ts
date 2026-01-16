import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis with controllable behavior
const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('@upstash/redis', () => {
  return {
    Redis: vi.fn().mockImplementation(function () {
      return {
        get: mockGet,
        set: mockSet,
      };
    }),
  };
});

// Mock Next.js cache
vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn) => fn),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    sR: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    client: { findMany: vi.fn() },
    permission: { findMany: vi.fn() },
    serviceCategory: { findMany: vi.fn() },
  },
}));

describe('Cache Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    mockSet.mockReset();
  });

  describe('Upstash Redis Cache Functions', () => {
    it('returns null for cacheGet when redis is not configured', async () => {
      vi.resetModules();
      delete process.env.UPSTASH_REDIS_REST_URL;
      const { cacheGet } = await import('../cache');
      const result = await cacheGet('test');
      expect(result).toBeNull();
    });

    it('isCacheAvailable returns false when redis is not configured', async () => {
      vi.resetModules();
      delete process.env.UPSTASH_REDIS_REST_URL;
      const { isCacheAvailable } = await import('../cache');
      expect(isCacheAvailable()).toBe(false);
    });

    it('isCacheAvailable returns true when redis is configured', async () => {
      vi.resetModules();
      process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
      // Trigger reassignment of redis client if needed, or re-import
      const { isCacheAvailable } = await import('../cache');
      // Assuming the module creates redis client on load if env vars are present
      expect(isCacheAvailable()).toBe(true);
    });

    describe('When Redis is configured', () => {
      beforeEach(async () => {
        vi.resetModules();
        process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
      });

      it('cacheGet returns value on hit', async () => {
        mockGet.mockResolvedValue('cached-value');
        const { cacheGet } = await import('../cache');
        const result = await cacheGet('key');
        expect(result).toBe('cached-value');
        expect(mockGet).toHaveBeenCalled();
      });

      it('cacheGet returns null on miss', async () => {
        mockGet.mockResolvedValue(null);
        const { cacheGet } = await import('../cache');
        const result = await cacheGet('key');
        expect(result).toBeNull();
      });

      it('cacheSet calls redis.set with options', async () => {
        const { cacheSet } = await import('../cache');
        await cacheSet('key', 'value', { ttlSeconds: 60 });
        expect(mockSet).toHaveBeenCalledWith(
          expect.stringContaining('key'),
          'value',
          expect.objectContaining({ ex: 60 })
        );
      });

      it('withCache returns cached value if hit', async () => {
        mockGet.mockResolvedValue('cached-data');
        const compute = vi.fn();
        const { withCache } = await import('../cache');

        const result = await withCache('key', compute);

        expect(result).toBe('cached-data');
        expect(compute).not.toHaveBeenCalled();
      });

      it('withCache computes and sets value if miss', async () => {
        mockGet.mockResolvedValue(null);
        const compute = vi.fn().mockResolvedValue('computed-data');
        const { withCache } = await import('../cache');

        const result = await withCache('key', compute);

        expect(result).toBe('computed-data');
        expect(compute).toHaveBeenCalled();
        expect(mockSet).toHaveBeenCalled();
      });
    });

    it('getCacheMetrics returns metrics object', async () => {
      const { getCacheMetrics } = await import('../cache');
      const metrics = getCacheMetrics();
      expect(metrics).toHaveProperty('hit');
    });

    it('withCache calls compute function when no redis', async () => {
      vi.resetModules();
      delete process.env.UPSTASH_REDIS_REST_URL;
      const { withCache } = await import('../cache');
      const compute = vi.fn().mockResolvedValue({ data: 'computed' });
      const result = await withCache('test-key', compute);
      expect(compute).toHaveBeenCalled();
      expect(result).toEqual({ data: 'computed' });
    });

    it('cacheSet does nothing when redis is not configured', async () => {
      vi.resetModules();
      delete process.env.UPSTASH_REDIS_REST_URL;
      const { cacheSet } = await import('../cache');
      await expect(cacheSet('test', 'val')).resolves.toBeUndefined();
    });

    it('cacheSet with TTL does nothing when redis is not configured', async () => {
      vi.resetModules();
      delete process.env.UPSTASH_REDIS_REST_URL;
      const { cacheSet } = await import('../cache');
      await expect(cacheSet('test', 'val', { ttlSeconds: 60 })).resolves.toBeUndefined();
    });
  });

  describe('Next.js unstable_cache Wrappers', () => {
    it('getCachedSRs calls prisma', async () => {
      const { getCachedSRs } = await import('../cache');
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.sR.findMany).mockResolvedValue([{ id: '1' }] as any);

      const result = await getCachedSRs({ skip: 0 });
      expect(result).toHaveLength(1);
      expect(prisma.sR.findMany).toHaveBeenCalled();
    });

    it('getCachedUsers calls prisma', async () => {
      const { getCachedUsers } = await import('../cache');
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', name: 'Test' }] as any);

      const result = await getCachedUsers();
      expect(result).toHaveLength(1);
      expect(prisma.user.findMany).toHaveBeenCalled();
    });

    it('getCachedClients calls prisma', async () => {
      const { getCachedClients } = await import('../cache');
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.client.findMany).mockResolvedValue([{ id: 'c1', name: 'Client' }] as any);

      const result = await getCachedClients();
      expect(result).toHaveLength(1);
      expect(prisma.client.findMany).toHaveBeenCalled();
    });

    it('getCachedPermissions calls prisma', async () => {
      const { getCachedPermissions } = await import('../cache');
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.permission.findMany).mockResolvedValue([{ id: 'p1' }] as any);

      const result = await getCachedPermissions();
      expect(result).toHaveLength(1);
      expect(prisma.permission.findMany).toHaveBeenCalled();
    });

    it('getCachedServiceCategories calls prisma', async () => {
      const { getCachedServiceCategories } = await import('../cache');
      const { default: prisma } = await import('@/lib/prisma');
      vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([{ id: 'sc1' }] as any);

      const result = await getCachedServiceCategories();
      expect(result).toHaveLength(1);
      expect(prisma.serviceCategory.findMany).toHaveBeenCalled();
    });
  });
});
