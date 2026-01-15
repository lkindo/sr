import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cacheUtils from '@/lib/cache';

// Mock Redis
vi.mock('@upstash/redis', () => {
	return {
		Redis: vi.fn().mockImplementation(() => ({
			get: vi.fn(),
			set: vi.fn(),
		})),
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
	}
}));

describe('Cache Utility', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset Redis env vars to test both cases
		delete process.env.UPSTASH_REDIS_REST_URL;
		delete process.env.UPSTASH_REDIS_REST_TOKEN;
	});

	describe('Upstash Redis Cache (when NOT configured)', () => {
		it('returns null for cacheGet', async () => {
			const result = await cacheUtils.cacheGet('test');
			expect(result).toBeNull();
		});

		it('does nothing for cacheSet', async () => {
			await expect(cacheUtils.cacheSet('test', 'val')).resolves.toBeUndefined();
		});

		it('does nothing for cacheSet with TTL', async () => {
			await expect(cacheUtils.cacheSet('test', 'val', { ttlSeconds: 60 })).resolves.toBeUndefined();
		});

		it('isCacheAvailable returns false', () => {
			expect(cacheUtils.isCacheAvailable()).toBe(false);
		});

		it('getCacheMetrics returns metrics object', () => {
			const metrics = cacheUtils.getCacheMetrics();
			expect(metrics).toHaveProperty('hit');
			expect(metrics).toHaveProperty('miss');
			expect(metrics).toHaveProperty('set');
			expect(metrics).toHaveProperty('invalidate');
			expect(typeof metrics.hit).toBe('number');
		});

		it('withCache calls compute function when no redis', async () => {
			const compute = vi.fn().mockResolvedValue({ data: 'computed' });
			const result = await cacheUtils.withCache('test-key', compute);
			expect(compute).toHaveBeenCalled();
			expect(result).toEqual({ data: 'computed' });
		});
	});

	describe('Next.js unstable_cache Wrappers', () => {
		it('getCachedSRs calls prisma', async () => {
			const { default: prisma } = await import('@/lib/prisma');
			vi.mocked(prisma.sR.findMany).mockResolvedValue([{ id: '1' }] as any);

			const result = await cacheUtils.getCachedSRs({ skip: 0 });
			expect(result).toHaveLength(1);
			expect(prisma.sR.findMany).toHaveBeenCalled();
		});

		it('getCachedUsers calls prisma', async () => {
			const { default: prisma } = await import('@/lib/prisma');
			vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', name: 'Test' }] as any);

			const result = await cacheUtils.getCachedUsers();
			expect(result).toHaveLength(1);
			expect(prisma.user.findMany).toHaveBeenCalled();
		});

		it('getCachedClients calls prisma', async () => {
			const { default: prisma } = await import('@/lib/prisma');
			vi.mocked(prisma.client.findMany).mockResolvedValue([{ id: 'c1', name: 'Client' }] as any);

			const result = await cacheUtils.getCachedClients();
			expect(result).toHaveLength(1);
			expect(prisma.client.findMany).toHaveBeenCalled();
		});

		it('getCachedPermissions calls prisma', async () => {
			const { default: prisma } = await import('@/lib/prisma');
			vi.mocked(prisma.permission.findMany).mockResolvedValue([{ id: 'p1' }] as any);

			const result = await cacheUtils.getCachedPermissions();
			expect(result).toHaveLength(1);
			expect(prisma.permission.findMany).toHaveBeenCalled();
		});

		it('getCachedServiceCategories calls prisma', async () => {
			const { default: prisma } = await import('@/lib/prisma');
			vi.mocked(prisma.serviceCategory.findMany).mockResolvedValue([{ id: 'sc1' }] as any);

			const result = await cacheUtils.getCachedServiceCategories();
			expect(result).toHaveLength(1);
			expect(prisma.serviceCategory.findMany).toHaveBeenCalled();
		});
	});
});

