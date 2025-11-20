import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoleRepository } from '../role.repository';

// Mock prisma
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockTransaction = vi.fn();
const mockDeleteMany = vi.fn();
const mockCreateMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
    default: {
        role: {
            findUnique: mockFindUnique,
            findMany: mockFindMany,
        },
        userRole: {
            count: mockCount,
        },
        rolePermission: {
            count: mockCount,
        },
        $transaction: mockTransaction,
    },
}));

describe('RoleRepository', () => {
    let repository: RoleRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new RoleRepository();
    });

    describe('findDetailsById', () => {
        it('상세 정보를 포함하여 역할을 조회해야 함', async () => {
            const mockRole = {
                id: 'role1',
                name: 'ADMIN',
                users: [],
                permissions: [],
            };

            mockFindUnique.mockResolvedValue(mockRole);

            const result = await repository.findDetailsById('role1');

            expect(result).toEqual(mockRole);
            expect(mockFindUnique).toHaveBeenCalledWith({
                where: { id: 'role1' },
                include: expect.objectContaining({
                    users: expect.any(Object),
                    permissions: expect.any(Object),
                }),
            });
        });
    });

    describe('findAll', () => {
        it('모든 역할을 조회해야 함', async () => {
            const mockRoles = [
                { id: 'role1', name: 'ADMIN' },
                { id: 'role2', name: 'USER' },
            ];

            mockFindMany.mockResolvedValue(mockRoles);

            const result = await repository.findAll();

            expect(result).toEqual(mockRoles);
            expect(mockFindMany).toHaveBeenCalled();
        });
    });

    describe('findByName', () => {
        it('이름으로 역할을 조회해야 함', async () => {
            const mockRole = { id: 'role1', name: 'ADMIN' };

            mockFindUnique.mockResolvedValue(mockRole);

            const result = await repository.findByName('ADMIN');

            expect(result).toEqual(mockRole);
            expect(mockFindUnique).toHaveBeenCalledWith({
                where: { name: 'ADMIN' },
            });
        });
    });

    describe('findByUserId', () => {
        it('사용자 ID로 역할을 조회해야 함', async () => {
            const mockRoles = [{ id: 'role1', name: 'ADMIN' }];

            mockFindMany.mockResolvedValue(mockRoles);

            const result = await repository.findByUserId('user1');

            expect(result).toEqual(mockRoles);
            expect(mockFindMany).toHaveBeenCalledWith({
                where: {
                    users: {
                        some: { userId: 'user1' },
                    },
                },
            });
        });
    });

    describe('getRelatedDataCounts', () => {
        it('관련 데이터 개수를 조회해야 함', async () => {
            mockCount
                .mockResolvedValueOnce(5) // usersCount
                .mockResolvedValueOnce(10); // permissionsCount

            const result = await repository.getRelatedDataCounts('role1');

            expect(result).toEqual({
                usersCount: 5,
                permissionsCount: 10,
            });
        });
    });

    describe('updateRolePermissions', () => {
        it('역할의 권한을 업데이트해야 함', async () => {
            mockTransaction.mockImplementation(async (callback) => {
                const tx = {
                    rolePermission: {
                        deleteMany: mockDeleteMany,
                        createMany: mockCreateMany,
                    },
                };
                return callback(tx);
            });

            await repository.updateRolePermissions('role1', ['perm1', 'perm2']);

            expect(mockTransaction).toHaveBeenCalled();
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { roleId: 'role1' },
            });
            expect(mockCreateMany).toHaveBeenCalledWith({
                data: [
                    { roleId: 'role1', permissionId: 'perm1' },
                    { roleId: 'role1', permissionId: 'perm2' },
                ],
            });
        });

        it('권한 목록이 비어있으면 생성하지 않아야 함', async () => {
            mockTransaction.mockImplementation(async (callback) => {
                const tx = {
                    rolePermission: {
                        deleteMany: mockDeleteMany,
                        createMany: mockCreateMany,
                    },
                };
                return callback(tx);
            });

            await repository.updateRolePermissions('role1', []);

            expect(mockDeleteMany).toHaveBeenCalled();
            expect(mockCreateMany).not.toHaveBeenCalled();
        });
    });
});
