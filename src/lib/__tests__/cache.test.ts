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

		it('isCacheAvailable returns false', () => {
			expect(cacheUtils.isCacheAvailable()).toBe(false);
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
	});
});
