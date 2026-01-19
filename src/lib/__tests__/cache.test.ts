import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  });

  describe('Cache Functions (No Redis)', () => {
    it('isCacheAvailable returns false', async () => {
      const { isCacheAvailable } = await import('../cache');
      expect(isCacheAvailable()).toBe(false);
    });

    it('cacheGet always returns null', async () => {
      const { cacheGet } = await import('../cache');
      const result = await cacheGet('test');
      expect(result).toBeNull();
    });

    it('withCache calls compute function immediately', async () => {
      const { withCache } = await import('../cache');
      const compute = vi.fn().mockResolvedValue('computed-data');

      const result = await withCache('key', compute);

      expect(result).toBe('computed-data');
      expect(compute).toHaveBeenCalled();
    });

    it('withCache does not cache result (subsequent calls trigger compute)', async () => {
      const { withCache } = await import('../cache');
      const compute = vi.fn().mockResolvedValue('computed-data');

      await withCache('key', compute);
      await withCache('key', compute);

      expect(compute).toHaveBeenCalledTimes(2);
    });

    it('cacheSet resolves successfully (no-op)', async () => {
      const { cacheSet } = await import('../cache');
      await expect(cacheSet('test', 'val')).resolves.toBeUndefined();
    });

    it('getCacheMetrics returns metrics object with updated counts', async () => {
      const { getCacheMetrics, cacheGet, cacheSet } = await import('../cache');

      // Reset logic not available in module, but we can check it increments
      const initialMetrics = getCacheMetrics();

      await cacheGet('test'); // miss++
      await cacheSet('test', 'value'); // set++

      const newMetrics = getCacheMetrics();
      expect(newMetrics.miss).toBeGreaterThan(initialMetrics.miss);
      expect(newMetrics.set).toBeGreaterThan(initialMetrics.set);
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
