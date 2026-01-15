import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSRAction, updateSRAction, getSRAction } from '../sr.actions'
import { SRService } from '@/services/sr.service'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/action-helpers', () => ({
	authenticateAndAuthorize: vi.fn(async () => ({
		user: { id: 'user-1', permissions: ['SR:CREATE'], roles: ['ENGINEER'] },
	})),
	validateWithSchema: vi.fn((data) => ({ success: true, data })),
	getAuthenticatedSession: vi.fn(async () => ({
		user: { id: 'user-2', permissions: ['SR:UPDATE'], roles: ['ENGINEER'] },
	})),
}))

describe('SR actions integration-ish', () => {
	const _service = new SRService() // 인스턴스 생성 확인용

	beforeEach(() => {
		vi.restoreAllMocks()
		vi.spyOn(SRService.prototype, 'createSR').mockResolvedValue({
			id: 'sr-1',
			title: 'New SR',
			description: 'Desc',
			client: { id: 'c1', code: 'C1', name: 'Client' },
			requester: { id: 'user-1', name: 'User', email: 'user@test.com' },
			assignee: null,
			serviceCategory: { id: 'sc1', categoryName: 'Category' },
		} as any)

		vi.spyOn(SRService.prototype, 'updateSR').mockResolvedValue({
			id: 'sr-1',
			title: 'Updated',
		} as any)

		vi.spyOn(SRService.prototype, 'getSRById').mockResolvedValue({
			id: 'sr-1',
			title: 'New SR',
		} as any)
	})

	it('createSRAction은 SRService를 호출하고 결과를 반환한다', async () => {
		const formData = new FormData()
		formData.set('title', 'New SR')
		formData.set('description', 'Desc')
		formData.set('clientId', 'client-1')
		formData.set('serviceCategoryId', 'sc-1')

		const result = await createSRAction(formData)

		expect(result.success).toBe(true)
		expect(SRService.prototype.createSR).toHaveBeenCalledWith(
			expect.objectContaining({ title: 'New SR', clientId: 'client-1' }),
			expect.objectContaining({ id: 'user-1' })
		)
	})

	it('updateSRAction은 SRService.updateSR을 호출한다', async () => {
		const formData = new FormData()
		formData.set('title', 'Updated Title')

		const result = await updateSRAction('sr-1', formData)

		expect(result.success).toBe(true)
		expect(SRService.prototype.updateSR).toHaveBeenCalledWith(
			'sr-1',
			expect.objectContaining({ title: 'Updated Title' }),
			expect.objectContaining({ id: 'user-2' })
		)
	})

	it('getSRAction은 SRService.getSRById를 통해 SR을 조회한다', async () => {
		const result = await getSRAction('sr-1')
		expect(result.success).toBe(true)
		expect(SRService.prototype.getSRById).toHaveBeenCalledWith('sr-1')
	})

	it('권한이 없는 경우 UnauthorizedError를 반환한다', async () => {
		vi.mocked(SRService.prototype.createSR).mockRejectedValueOnce(new UnauthorizedError())
		const formData = new FormData()
		formData.set('title', 'New SR')
		formData.set('clientId', 'client-1')
		formData.set('serviceCategoryId', 'sc-1')

		const result = await createSRAction(formData)
		expect(result.success).toBe(false)
		expect((result as any).code).toBe('UNAUTHORIZED')
	})
})

