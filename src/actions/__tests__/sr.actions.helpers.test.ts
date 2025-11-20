import { describe, it, expect } from 'vitest'
import { buildSRCreateInput, buildSRUpdateInput } from '../sr-form.utils'

describe('sr.actions helpers', () => {
	it('buildSRCreateInput는 기본값과 필드를 정리한다', () => {
		const formData = new FormData()
		formData.set('title', 'New')
		formData.set('description', 'Desc')
		formData.set('clientId', 'client-1')
		formData.set('serviceCategoryId', 'sc-1')

		const result = buildSRCreateInput(formData)

		expect(result).toEqual({
			title: 'New',
			description: 'Desc',
			clientId: 'client-1',
			serviceCategoryId: 'sc-1',
			requestedPriority: 'MEDIUM',
			requestedCompletionDate: undefined,
		})
	})

	it('buildSRUpdateInput는 숫자/빈 값을 정규화한다', () => {
		const formData = new FormData()
		formData.set('title', '')
		formData.set('satisfactionRating', '5')
		formData.set('estimatedHours', '2.5')
		formData.set('status', '')

		const processed = buildSRUpdateInput(formData)

		expect(processed.title).toBeNull()
		expect(processed.satisfactionRating).toBe(5)
		expect(processed.estimatedHours).toBe(2.5)
		expect(processed.status).toBeUndefined()
	})
})

