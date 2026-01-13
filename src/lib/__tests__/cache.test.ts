import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Setup initial mocks
const mockRedis = {
	get: vi.fn(),
	set: vi.fn(),
};

vi.mock('@upstash/redis', () => ({
	Redis: class {
		constructor() {
			return mockRedis;
		}
	},
}));

vi.mock('next/cache', () => ({
	unstable_cache: vi.fn((fn) => fn),
	revalidateTag: vi.fn(),
}));

const mockPrisma = {
	sR: { findMany: vi.fn() },
	user: { findMany: vi.fn() },
	client: { findMany: vi.fn() },
	permission: { findMany: vi.fn() },
	serviceCategory: { findMany: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
	default: mockPrisma,
}));

describe('cache (Upstash)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
	});

	describe('isCacheAvailable', () => {
		it('returns false when env vars are missing', async () => {
			vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
			vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

			// We need to re-import to pick up env var changes if the module reads them at top level
			// BUT `cache.ts` likely initializes Redis instance at top level or lazily.
			// Based on typical patterns, it's safer to re-require or rely on how the module is written.
			// If `cache.ts` creates `redis` client at top level, stubbing env vars AFTER import won't affect it 
			// unless we reset modules.
			vi.resetModules();
			const mod = await import('../cache');
			expect(mod.isCacheAvailable()).toBe(false);
		});

		it('returns true when env vars are present', async () => {
			vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.redis');
			vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');

			vi.resetModules();
			const mod = await import('../cache');
			expect(mod.isCacheAvailable()).toBe(true);
		});
	});

	describe('cache operations', () => {
		let mod: typeof import('../cache');

		beforeEach(async () => {
			vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.redis');
			vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
			vi.resetModules();
			mod = await import('../cache');
		});

		it('cacheSet calls redis set with correct params', async () => {
			await mod.cacheSet('key', { value: 1 }, { namespace: 'ns', ttlSeconds: 60 });
			expect(mockRedis.set).toHaveBeenCalledWith('ns:key', { value: 1 }, { ex: 60 });
		});

		it('cacheGet calls redis get and updates metrics', async () => {
			mockRedis.get.mockResolvedValue(null);
			await expect(mod.cacheGet('key')).resolves.toBeNull();
			expect(mod.getCacheMetrics().miss).toBe(1);

			mockRedis.get.mockResolvedValue('value');
			await expect(mod.cacheGet('key')).resolves.toBe('value');
			expect(mod.getCacheMetrics().hit).toBe(1);
		});
	});
});



