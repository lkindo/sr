import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionRepository } from '../permission.repository';

// Mock prisma
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
    default: {
        permission: {
            findUnique: mockFindUnique,
            findMany: mockFindMany,
        },
    },
}));

describe('PermissionRepository', () => {
    let repository: PermissionRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new PermissionRepository();
    });

    describe('findDetailsById', () => {
        it('상세 정보를 포함하여 권한을 조회해야 함', async () => {
            const mockPermission = {
                id: 'perm1',
                resource: 'SR',
                action: 'CREATE',
                roles: [],
            };

            mockFindUnique.mockResolvedValue(mockPermission);

            const result = await repository.findDetailsById('perm1');

            expect(result).toEqual(mockPermission);
            expect(mockFindUnique).toHaveBeenCalledWith({
                where: { id: 'perm1' },
                include: {
                    roles: {
                        include: {
                            role: true,
                        },
                    },
                },
            });
        });
    });

    describe('findByResourceAndAction', () => {
        it('리소스와 액션으로 권한을 조회해야 함', async () => {
            const mockPermission = {
                id: 'perm1',
                resource: 'SR',
                action: 'CREATE',
            };

            mockFindUnique.mockResolvedValue(mockPermission);

            const result = await repository.findByResourceAndAction('SR', 'CREATE');

            expect(result).toEqual(mockPermission);
            expect(mockFindUnique).toHaveBeenCalledWith({
                where: {
                    resource_action: {
                        resource: 'SR',
                        action: 'CREATE',
                    },
                },
            });
        });
    });

    describe('findByRoleId', () => {
        it('역할 ID로 권한 목록을 조회해야 함', async () => {
            const mockPermissions = [
                { id: 'perm1', resource: 'SR', action: 'CREATE' },
            ];

            mockFindMany.mockResolvedValue(mockPermissions);

            const result = await repository.findByRoleId('role1');

            expect(result).toEqual(mockPermissions);
            expect(mockFindMany).toHaveBeenCalledWith({
                where: {
                    roles: {
                        some: {
                            roleId: 'role1',
                        },
                    },
                },
            });
        });
    });

    describe('findByResource', () => {
        it('리소스 이름으로 권한 목록을 조회해야 함', async () => {
            const mockPermissions = [
                { id: 'perm1', resource: 'SR', action: 'CREATE' },
                { id: 'perm2', resource: 'SR', action: 'READ' },
            ];

            mockFindMany.mockResolvedValue(mockPermissions);

            const result = await repository.findByResource('SR');

            expect(result).toEqual(mockPermissions);
            expect(mockFindMany).toHaveBeenCalledWith({
                where: { resource: 'SR' },
            });
        });
    });
});
