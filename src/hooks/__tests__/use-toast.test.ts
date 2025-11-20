import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

async function loadModule() {
	const mod = await import('../use-toast')
	return mod
}

beforeEach(() => {
	vi.resetModules()
})

afterEach(async () => {
	const { __resetToastsForTest } = await loadModule()
	__resetToastsForTest()
})

describe('useToast', () => {
	it('reducer는 토스트 추가/업데이트/삭제를 처리한다', async () => {
		const { reducer } = await loadModule()
		const toastA = { id: 'a', title: 'A', open: true } as any
		const toastB = { id: 'b', title: 'B', open: true } as any

		const afterAdd = reducer({ toasts: [] }, { type: 'ADD_TOAST', toast: toastA })
		expect(afterAdd.toasts).toHaveLength(1)
		expect(afterAdd.toasts[0].id).toBe('a')

		const limited = reducer(afterAdd, { type: 'ADD_TOAST', toast: toastB })
		expect(limited.toasts).toHaveLength(1)
		expect(limited.toasts[0].id).toBe('b')

		const afterUpdate = reducer(limited, {
			type: 'UPDATE_TOAST',
			toast: { id: 'b', title: 'B updated' },
		})
		expect(afterUpdate.toasts[0].title).toBe('B updated')

		const afterDismiss = reducer(afterUpdate, {
			type: 'DISMISS_TOAST',
			toastId: 'b',
		})
		expect(afterDismiss.toasts[0].open).toBe(false)

		const afterRemove = reducer(afterDismiss, { type: 'REMOVE_TOAST', toastId: 'b' })
		expect(afterRemove.toasts).toHaveLength(0)
	})

	it('useToast 훅은 toast/dismiss 헬퍼를 통해 상태를 관리한다', async () => {
		const { useToast, toast } = await loadModule()
		const { result } = renderHook(() => useToast())

		let createdId = ''
		act(() => {
			const { id } = toast({ title: '알림', description: '처리가 완료되었습니다.' })
			createdId = id
		})

		expect(result.current.toasts).toHaveLength(1)
		expect(result.current.toasts[0].title).toBe('알림')
		expect(result.current.toasts[0].open).toBe(true)

		act(() => {
			result.current.dismiss(createdId)
		})

		expect(result.current.toasts[0].open).toBe(false)
	})
})


