import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePermissions } from '../use-permissions'
import { useSession } from 'next-auth/react'

vi.mock('next-auth/react', () => ({
	useSession: vi.fn(),
}))

const mockedUseSession = vi.mocked(useSession)

describe('usePermissions', () => {
	beforeEach(() => {
		mockedUseSession.mockReset()
	})

	it('세션 권한과 역할을 기반으로 헬퍼를 제공한다', () => {
		mockedUseSession.mockReturnValue({
			data: {
				user: {
					permissions: ['sr.view', 'sr.edit', 'user.manage'],
					roles: ['ADMIN', 'MANAGER'],
				},
			},
		} as any)

		const { result } = renderHook(() => usePermissions())

		expect(result.current.permissions).toEqual(['sr.view', 'sr.edit', 'user.manage'])
		expect(result.current.roles).toEqual(['ADMIN', 'MANAGER'])
		expect(result.current.hasPermission('sr', 'view')).toBe(true)
		expect(result.current.hasPermission('sr', 'delete')).toBe(false)
		expect(
			result.current.hasAnyPermission([
				{ resource: 'sr', action: 'delete' },
				{ resource: 'user', action: 'manage' },
			])
		).toBe(true)
		expect(
			result.current.hasAllPermissions([
				{ resource: 'sr', action: 'view' },
				{ resource: 'sr', action: 'edit' },
			])
		).toBe(true)
		expect(result.current.hasRole('ADMIN')).toBe(true)
		expect(result.current.hasAnyRole(['OPERATOR', 'MANAGER'])).toBe(true)
		expect(result.current.isAdmin()).toBe(true)
	})

	it('세션이 없으면 안전한 기본값을 사용한다', () => {
		mockedUseSession.mockReturnValue({ data: null } as any)

		const { result } = renderHook(() => usePermissions())

		expect(result.current.permissions).toEqual([])
		expect(result.current.roles).toEqual([])
		expect(result.current.hasPermission('sr', 'view')).toBe(false)
		expect(
			result.current.hasAnyPermission([{ resource: 'sr', action: 'view' }])
		).toBe(false)
		expect(result.current.hasAllPermissions([])).toBe(false)
		expect(result.current.hasRole('ADMIN')).toBe(false)
		expect(result.current.hasAnyRole(['USER'])).toBe(false)
		expect(result.current.isAdmin()).toBe(false)
	})
})


