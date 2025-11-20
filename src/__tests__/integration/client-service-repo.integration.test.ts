import { describe, it, expect, beforeEach } from 'vitest'
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'
import { ClientService } from '@/services/client.service'
import { ReferentialIntegrityError } from '@/lib/errors'
import { ClientRepository } from '@/repositories/client.repository'
import { ServiceCategoryRepository } from '@/repositories/service-category.repository'

const prismaMock = mockDeep<PrismaClient>()

describe('ClientService + Repository integration', () => {
	let service: ClientService
	let clientRepository: ClientRepository
	let serviceCategoryRepository: ServiceCategoryRepository

	beforeEach(() => {
		mockReset(prismaMock as DeepMockProxy<PrismaClient>)
		clientRepository = new ClientRepository(prismaMock.client as any, prismaMock as any)
		serviceCategoryRepository = new ServiceCategoryRepository(prismaMock.serviceCategory as any)
		service = new ClientService(
			clientRepository,
			{} as any,
			serviceCategoryRepository,
			{} as any
		)
	})

	it('createClient는 중복 코드를 검사하고 저장한다', async () => {
		const payload = {
			code: 'CLI-1',
			name: 'Acme',
			industry: 'IT',
			contactPerson: 'Kim',
			contactEmail: 'kim@example.com',
			contactPhone: '010-0000-0000',
			address: 'Seoul',
			contractStartDate: undefined,
			contractEndDate: undefined,
		}

		prismaMock.client.findUnique.mockResolvedValueOnce(null as any)
		prismaMock.client.create.mockResolvedValueOnce({ id: 'client-1', ...payload } as any)

		const created = await service.createClient(payload)

		expect(prismaMock.client.findUnique).toHaveBeenCalledWith(expect.objectContaining({
			where: { code: 'CLI-1' },
		}))
		expect(prismaMock.client.create).toHaveBeenCalledWith(expect.objectContaining({
			data: expect.objectContaining({ code: 'CLI-1', name: 'Acme' }),
		}))
		expect(created).toMatchObject({ id: 'client-1', name: 'Acme' })
	})

	it('deleteClient는 관련 데이터가 있으면 ReferentialIntegrityError를 던진다', async () => {
		prismaMock.client.findUnique.mockResolvedValueOnce({ id: 'client-1' } as any)
		prismaMock.sR.count.mockResolvedValueOnce(2)
		prismaMock.userClient.count.mockResolvedValueOnce(1)
		prismaMock.serviceCategory.count.mockResolvedValueOnce(0)
		prismaMock.clientHandler.count.mockResolvedValueOnce(0)

		await expect(service.deleteClient('client-1')).rejects.toBeInstanceOf(ReferentialIntegrityError)
	})

	it('getClientWithDetailsAndCategories는 레포지토리와 서비스 카테고리를 결합한다', async () => {
		prismaMock.client.findUnique.mockResolvedValueOnce({
			id: 'client-1',
			name: 'Acme',
			users: [
				{
					user: {
						roles: [{ role: { name: 'ADMIN' } }],
					},
				},
				{
					user: {
						roles: [{ role: { name: 'ENGINEER' } }],
					},
				},
			],
		} as any)

		prismaMock.serviceCategory.findMany.mockResolvedValueOnce([
			{ id: 'sc-1', categoryName: 'Support', isActive: true },
		] as any)

		const result = await service.getClientWithDetailsAndCategories('client-1')

		expect(result?.serviceCategories).toHaveLength(1)
		expect(result?.users).toHaveLength(1)
		expect(result?.users?.[0]?.user?.roles?.[0]?.role?.name).toBe('ENGINEER')
	})
})

