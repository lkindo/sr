import { describe, it, expect } from 'vitest'
import { SRPolicy } from '../policies/sr.policy'

const baseSR = {
	id: 'sr-1',
	requesterId: 'user-1',
	status: 'REQUESTED',
	clientId: 'client-1',
} as any

const admin = { id: 'admin', roles: ['ADMIN'], permissions: ['SR:CREATE', 'SR:READ', 'SR:UPDATE', 'SR:DELETE'], permissionsGrantedAt: {}, clientIds: ['client-1'] } as any
const requester = { id: 'user-1', roles: [], permissions: ['SR:CREATE', 'SR:UPDATE_SELF'], permissionsGrantedAt: {}, clientIds: ['client-1'] } as any
const viewer = { id: 'viewer', roles: [], permissions: ['SR:READ'], permissionsGrantedAt: {}, clientIds: ['client-1'] } as any
const noPerm = { id: 'user-2', roles: [], permissions: [], permissionsGrantedAt: {}, clientIds: ['client-1'] } as any

describe('SRPolicy', () => {
	const policy = new SRPolicy()

	it('관리자는 모든 권한을 가진다', () => {
		expect(policy.canCreate(admin)).toBe(true)
		expect(policy.canRead(admin, baseSR)).toBe(true)
		expect(policy.canUpdate(admin, baseSR)).toBe(true)
		expect(policy.canDelete(admin)).toBe(true)
	})

	it('요청자는 자신이 요청한 SR을 읽고 self-update할 수 있다', () => {
		expect(policy.canRead(requester, baseSR)).toBe(true)
		expect(policy.canUpdate(requester, baseSR)).toBe(true)
		expect(policy.canDelete(requester)).toBe(false)
	})

	it('권한 없는 사용자는 거부된다', () => {
		expect(policy.canCreate(noPerm)).toBe(false)
		expect(policy.canRead(noPerm, baseSR)).toBe(false)
		expect(policy.canUpdate(noPerm, baseSR)).toBe(false)
		expect(policy.canDelete(noPerm)).toBe(false)
	})

	it('ensure 메서드는 권한 없을 때 예외를 던진다', () => {
		expect(() => policy.ensureCanCreate(noPerm)).toThrowError(/생성/)
		expect(() => policy.ensureCanRead(noPerm, baseSR)).toThrowError(/조회/)
		expect(() => policy.ensureCanUpdate(noPerm, baseSR)).toThrowError(/수정/)
		expect(() => policy.ensureCanDelete(noPerm)).toThrowError(/삭제/)
	})
})

