import { describe, expect, it } from 'vitest'
import {
	CACHE_NS,
	DASHBOARD_STATS_PREFIX,
	MY_REQUESTS_PREFIX,
	SR_DETAIL_PREFIX,
	SR_LIST_PREFIX,
	dashboardStatsKey,
	dashboardStatsPatternAll,
	myRequestsKey,
	myRequestsPatternAll,
	srDetailKey,
	srListKey,
	srListPatternAll,
	srListPatternForClient,
	srListPatternForPriority,
	srListPatternForStatus,
} from '../cache-keys'

describe('cache-keys', () => {
	it('기본 상수들이 정의되어야 한다', () => {
		expect(CACHE_NS).toBe('sr')
		expect(SR_LIST_PREFIX).toBe('sr:list:')
		expect(SR_DETAIL_PREFIX).toBe('sr:detail:')
		expect(DASHBOARD_STATS_PREFIX).toBe('dashboard:stats:')
		expect(MY_REQUESTS_PREFIX).toBe('srs:my-requests:')
	})

	it('SR 목록 키를 생성해야 한다', () => {
		expect(
			srListKey({ status: 'OPEN', clientId: 'cli', priority: 'HIGH' })
		).toBe('sr:list:OPEN:cli:HIGH')

		expect(srListKey({ status: null, clientId: undefined, priority: null })).toBe(
			'sr:list:any:any:any'
		)
	})

	it('SR 목록 패턴을 생성해야 한다', () => {
		expect(srListPatternForClient('client')).toBe('sr:list:*:client:*')
		expect(srListPatternForStatus('CLOSED')).toBe('sr:list:CLOSED:*:*')
		expect(srListPatternForPriority('LOW')).toBe('sr:list:*:*:LOW')
		expect(srListPatternAll()).toBe('sr:list:*')
	})

	it('내 요청 및 대시보드 패턴을 생성해야 한다', () => {
		expect(myRequestsPatternAll()).toBe('srs:my-requests:*')
		expect(dashboardStatsPatternAll()).toBe('dashboard:stats:*')
	})

	it('세부 키를 생성해야 한다', () => {
		expect(srDetailKey('123')).toBe('sr:detail:123')
	})

	it('대시보드 키는 기본값을 가진다', () => {
		expect(dashboardStatsKey()).toBe('dashboard:stats:global:generic')
		expect(
			dashboardStatsKey({ userId: 'user', roleScope: 'admin' })
		).toBe('dashboard:stats:user:admin')
	})

	it('내 요청 키를 생성해야 한다', () => {
		expect(myRequestsKey('user', null, undefined)).toBe(
			'srs:my-requests:user:all:createdAt'
		)
		expect(myRequestsKey('user', 'OPEN', 'updatedAt')).toBe(
			'srs:my-requests:user:OPEN:updatedAt'
		)
	})
})


