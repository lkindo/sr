import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type CacheModule = typeof import('../cache')

async function importCacheWithoutRedis(): Promise<CacheModule> {
	vi.resetModules()
	vi.unstubAllEnvs()
	delete process.env.UPSTASH_REDIS_REST_URL
	delete process.env.UPSTASH_REDIS_REST_TOKEN

	return import('../cache')
}

async function importCacheWithRedis() {
	vi.resetModules()
	vi.unstubAllEnvs()
	vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.redis')
	vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')

	const getMock = vi.fn()
	const setMock = vi.fn()
	const unstableCacheSpy = vi.fn(
		(fn: (...args: any[]) => Promise<any>, keys: string[], options: any) => {
			const wrapped = (...args: any[]) => fn(...args)
			Object.assign(wrapped, { __cacheKeys: keys, __cacheOptions: options })
			return wrapped
		}
	)

	const prismaMock = {
		sR: { findMany: vi.fn().mockResolvedValue([]) },
		user: { findMany: vi.fn().mockResolvedValue([]) },
		client: { findMany: vi.fn().mockResolvedValue([]) },
		permission: { findMany: vi.fn().mockResolvedValue([]) },
		serviceCategory: { findMany: vi.fn().mockResolvedValue([]) },
	} as any

	class RedisMock {
		get = getMock
		set = setMock
		constructor() {}
	}
	vi.doMock('@upstash/redis', () => ({
		Redis: RedisMock,
	}))
	vi.doMock('next/cache', () => ({
		unstable_cache: unstableCacheSpy,
	}))
	vi.doMock('@/lib/prisma', () => ({
		default: prismaMock,
	}))

	const mod = await import('../cache')
	return { mod, getMock, setMock, unstableCacheSpy, prismaMock }
}

describe('cache (Upstash)', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('Redis가 없으면 안전하게 동작한다', async () => {
		const mod = await importCacheWithoutRedis()

		expect(mod.isCacheAvailable()).toBe(false)
		await expect(mod.cacheGet('missing')).resolves.toBeNull()
		await expect(mod.cacheSet('key', 'value')).resolves.toBeUndefined()
		expect(mod.getCacheMetrics()).toEqual({
			hit: 0,
			miss: 0,
			set: 0,
			invalidate: 0,
		})
	})

	it('네임스페이스와 TTL을 적용해 캐시를 설정한다', async () => {
		const { mod, setMock } = await importCacheWithRedis()

		await mod.cacheSet('dashboard', { value: 1 }, { namespace: 'sr', ttlSeconds: 120 })
		expect(setMock).toHaveBeenCalledWith('sr:dashboard', { value: 1 }, { ex: 120 })

		setMock.mockClear()
		await mod.cacheSet('list', { value: 2 }, { ttlSeconds: 0 })
		expect(setMock).toHaveBeenCalledWith('list', { value: 2 })
	})

	it('cacheGet과 withCache는 히트/미스 메트릭을 갱신한다', async () => {
		const { mod, getMock, setMock } = await importCacheWithRedis()
		getMock.mockResolvedValueOnce(null)

		await expect(mod.cacheGet('foo', { namespace: 'ns' })).resolves.toBeNull()
		expect(getMock).toHaveBeenCalledWith('ns:foo')

		getMock.mockResolvedValueOnce(null).mockResolvedValueOnce('cached')
		const compute = vi.fn().mockResolvedValue('fresh')
		const first = await mod.withCache('foo', compute)
		expect(first).toBe('fresh')
		expect(compute).toHaveBeenCalledTimes(1)
		expect(setMock).toHaveBeenCalledWith('foo', 'fresh')

		const second = await mod.withCache('foo', compute)
		expect(second).toBe('cached')
		expect(compute).toHaveBeenCalledTimes(1)

		expect(mod.getCacheMetrics()).toEqual({
			hit: 1,
			miss: 2,
			set: 1,
			invalidate: 0,
		})
	})

	it('Next cache 래퍼는 올바른 키와 옵션으로 생성된다', async () => {
		const { mod, unstableCacheSpy, prismaMock } = await importCacheWithRedis()

		const keys = unstableCacheSpy.mock.calls.map(([, cacheKeys]) => cacheKeys)
		expect(keys).toEqual([['srs'], ['users'], ['clients'], ['permissions'], ['service-categories']])
		const revalidateValues = unstableCacheSpy.mock.calls.map(([, , options]) => options.revalidate)
		expect(revalidateValues).toEqual([300, 300, 300, 600, 600])

		await mod.getCachedSRs({ where: { status: 'OPEN' }, take: 10 })
		expect(prismaMock.sR.findMany).toHaveBeenCalledWith({
			where: { status: 'OPEN' },
			orderBy: undefined,
			skip: undefined,
			take: 10,
			include: expect.objectContaining({
				client: expect.any(Object),
				requester: expect.any(Object),
				assignee: expect.any(Object),
				serviceCategory: expect.any(Object),
			}),
		})

		await mod.getCachedUsers()
		expect(prismaMock.user.findMany).toHaveBeenCalledWith({
			where: { isActive: true },
			select: { id: true, name: true, email: true },
		})

		await mod.getCachedClients()
		expect(prismaMock.client.findMany).toHaveBeenCalledWith({
			where: { isActive: true },
			select: { id: true, code: true, name: true },
		})

		await mod.getCachedPermissions()
		expect(prismaMock.permission.findMany).toHaveBeenCalled()

		await mod.getCachedServiceCategories()
		expect(prismaMock.serviceCategory.findMany).toHaveBeenCalledWith({
			where: { isActive: true },
			include: expect.objectContaining({
				handler: expect.any(Object),
				backupHandler: expect.any(Object),
			}),
		})
	})
})


