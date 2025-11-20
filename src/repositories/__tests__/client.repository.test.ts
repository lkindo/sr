import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientRepository } from '../client.repository';

// Mock prisma
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockCount = vi.fn();

vi.mock('@/lib/prisma', () => ({
    default: {
        client: {
            findUnique: mockFindUnique,
            findFirst: mockFindFirst,
            findMany: mockFindMany,
            update: mockUpdate,
        },
        sR: {
            count: mockCount,
        },
        userClient: {
            count: mockCount,
        },
        serviceCategory: {
            count: mockCount,
        },
        clientHandler: {
            count: mockCount,
        },
    },
}));

describe('ClientRepository', () => {
    let repository: ClientRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new ClientRepository();
    });

    describe('findDetailsById', () => {
        it('상세 정보를 포함하여 고객사를 조회해야 함', async () => {
            const mockClient = {
                id: 'client1',
                name: 'Test Client',
                code: 'TC001',
                users: [],
                srs: [],
                serviceCategories: [],
                clientHandlers: [],
            };

            mockFindUnique.mockResolvedValue(mockClient);

            const result = await repository.findDetailsById('client1');

            expect(result).toEqual(mockClient);
            expect(mockFindUnique).toHaveBeenCalledWith({
                where: { id: 'client1' },
                include: expect.objectContaining({
                    users: expect.any(Object),
                    srs: true,
                    serviceCategories: true,
                    clientHandlers: expect.any(Object),
                }),
            });
        });

        it('존재하지 않는 고객사는 null을 반환해야 함', async () => {
            mockFindUnique.mockResolvedValue(null);

            const result = await repository.findDetailsById('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('findAll', () => {
        it('모든 고객사를 조회해야 함', async () => {
            const mockClients = [
                { id: 'client1', name: 'Client 1', code: 'C001' },
                { id: 'client2', name: 'Client 2', code: 'C002' },
            ];

            mockFindMany.mockResolvedValue(mockClients);

            const result = await repository.findAll();

            expect(result).toEqual(mockClients);
            expect(mockFindMany).toHaveBeenCalled();
        });

        it('페이지네이션 파라미터를 적용해야 함', async () => {
            mockFindMany.mockResolvedValue([]);

            await repository.findAll({
                skip: 10,
                take: 20,
            });

            expect(mockFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    skip: 10,
                    take: 20,
                })
            );
        });

        it('필터 조건을 적용해야 함', async () => {
            mockFindMany.mockResolvedValue([]);

            await repository.findAll({
                where: { isActive: true },
            });

            expect(mockFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { isActive: true },
                })
            );
        });

        it('정렬 조건을 적용해야 함', async () => {
            mockFindMany.mockResolvedValue([]);

            await repository.findAll({
                orderBy: { name: 'asc' },
            });

            expect(mockFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: { name: 'asc' },
                })
            );
        });
    });

    describe('findByCode', () => {
        it('코드로 고객사를 조회해야 함', async () => {
            const mockClient = {
                id: 'client1',
                name: 'Test Client',
                code: 'TC001',
            };

            mockFindUnique.mockResolvedValue(mockClient);

            const result = await repository.findByCode('TC001');

            expect(result).toEqual(mockClient);
            expect(mockFindUnique).toHaveBeenCalledWith({
                where: { code: 'TC001' },
            });
        });

        it('존재하지 않는 코드는 null을 반환해야 함', async () => {
            mockFindUnique.mockResolvedValue(null);

            const result = await repository.findByCode('NONEXISTENT');

            expect(result).toBeNull();
        });
    });

    describe('findByName', () => {
        it('이름으로 고객사를 검색해야 함', async () => {
            const mockClient = {
                id: 'client1',
                name: 'Test Client',
                code: 'TC001',
            };

            mockFindFirst.mockResolvedValue(mockClient);

            const result = await repository.findByName('Test');

            expect(result).toEqual(mockClient);
            expect(mockFindFirst).toHaveBeenCalledWith({
                where: { name: { contains: 'Test', mode: 'insensitive' } },
            });
        });

        it('대소문자를 구분하지 않고 검색해야 함', async () => {
            mockFindFirst.mockResolvedValue(null);

            await repository.findByName('test');

            expect(mockFindFirst).toHaveBeenCalledWith({
                where: { name: { contains: 'test', mode: 'insensitive' } },
            });
        });
    });

    describe('findByUserId', () => {
        it('사용자 ID로 고객사 목록을 조회해야 함', async () => {
            const mockClients = [
                { id: 'client1', name: 'Client 1' },
                { id: 'client2', name: 'Client 2' },
            ];

            mockFindMany.mockResolvedValue(mockClients);

            const result = await repository.findByUserId('user123');

            expect(result).toEqual(mockClients);
            expect(mockFindMany).toHaveBeenCalledWith({
                where: {
                    users: {
                        some: {
                            userId: 'user123',
                        },
                    },
                },
            });
        });

        it('사용자가 속한 고객사가 없으면 빈 배열을 반환해야 함', async () => {
            mockFindMany.mockResolvedValue([]);

            const result = await repository.findByUserId('user-without-clients');

            expect(result).toEqual([]);
        });
    });

    describe('activateClient', () => {
        it('고객사를 활성화해야 함', async () => {
            const mockClient = {
                id: 'client1',
                name: 'Test Client',
                isActive: true,
            };

            mockUpdate.mockResolvedValue(mockClient);

            const result = await repository.activateClient('client1');

            expect(result).toEqual(mockClient);
            expect(mockUpdate).toHaveBeenCalledWith({
                where: { id: 'client1' },
                data: { isActive: true },
            });
        });
    });

    describe('deactivateClient', () => {
        it('고객사를 비활성화해야 함', async () => {
            const mockClient = {
                id: 'client1',
                name: 'Test Client',
                isActive: false,
            };

            mockUpdate.mockResolvedValue(mockClient);

            const result = await repository.deactivateClient('client1');

            expect(result).toEqual(mockClient);
            expect(mockUpdate).toHaveBeenCalledWith({
                where: { id: 'client1' },
                data: { isActive: false },
            });
        });
    });

    describe('getRelatedDataCounts', () => {
        it('관련 데이터 개수를 조회해야 함', async () => {
            mockCount
                .mockResolvedValueOnce(5) // srsCount
                .mockResolvedValueOnce(3) // usersCount
                .mockResolvedValueOnce(2) // serviceCategoriesCount
                .mockResolvedValueOnce(1); // clientHandlersCount

            const result = await repository.getRelatedDataCounts('client1');

            expect(result).toEqual({
                srsCount: 5,
                usersCount: 3,
                serviceCategoriesCount: 2,
                clientHandlersCount: 1,
            });
        });

        it('관련 데이터가 없으면 모두 0을 반환해야 함', async () => {
            mockCount
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0);

            const result = await repository.getRelatedDataCounts('client-without-data');

            expect(result).toEqual({
                srsCount: 0,
                usersCount: 0,
                serviceCategoriesCount: 0,
                clientHandlersCount: 0,
            });
        });
    });
});
