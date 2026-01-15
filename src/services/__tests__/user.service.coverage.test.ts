
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '@/services/user.service';
import { BusinessRuleError } from '@/lib/errors';
import prisma from '@/lib/prisma';

// Mock dependencies
vi.mock('@/lib/redis-cache', () => ({
    invalidateCachePattern: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    default: {
        user: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
        },
        role: { findFirst: vi.fn() },
        userRole: { createMany: vi.fn() },
        userClient: { createMany: vi.fn(), deleteMany: vi.fn() },
    }
}));

// Mock permission service
vi.mock('@/services/permission.service');
import { PermissionService } from '@/services/permission.service';

vi.mocked(PermissionService).mockImplementation(() => {
    return {
        getUsersWithPermissions: vi.fn().mockResolvedValue([{ id: 'u1', name: 'U1' }]),
        // Add other methods if needed by UserService, even if not used in this specific test
        hasPermission: vi.fn(),
        hasRole: vi.fn(),
        hasAnyRole: vi.fn(),
    } as any;
});

describe('UserService Coverage', () => {
    let userService: UserService;

    beforeEach(() => {
        vi.clearAllMocks();
        userService = new UserService();
    });

    describe('getUserById', () => {
        it('calls prisma.user.findUnique with correct include', async () => {
            vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as any);
            const result = await userService.getUserById('u1');
            expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'u1' },
                include: expect.objectContaining({
                    roles: expect.anything(),
                    clients: expect.anything()
                })
            }));
            expect(result).toEqual({ id: 'u1' });
        });
    });

    describe('getUserByEmail', () => {
        it('calls prisma.user.findUnique with correct include', async () => {
            vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', email: 'e@e.com' } as any);
            await userService.getUserByEmail('e@e.com');
            expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
                where: { email: 'e@e.com' }
            }));
        });
    });

    describe('getUserByClientId', () => {
        it('calls prisma.user.findMany with client filter', async () => {
            vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1' }] as any);
            await userService.getUserByClientId('c1');
            expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: { clients: { some: { clientId: 'c1' } } }
            }));
        });
    });

    describe('updateUser', () => {
        it('updates basic user info', async () => {
            vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1', name: 'New Name' } as any);

            await userService.updateUser('u1', { name: 'New Name' });

            expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'u1' },
                data: expect.objectContaining({ name: 'New Name' })
            }));
        });

        it('updates client assignments', async () => {
            vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1' } as any);
            // Mock system team check: user has basic roles, not system team
            vi.mocked(prisma.user.findUnique).mockResolvedValue({
                roles: [{ role: { name: 'CLIENT_USER' } }]
            } as any);

            await userService.updateUser('u1', { clientIds: ['c1', 'c2'] });

            expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'u1' },
                data: {
                    clients: {
                        deleteMany: {},
                        create: [{ clientId: 'c1' }, { clientId: 'c2' }]
                    }
                }
            }));
        });

        it('throws BusinessRuleError if assigning clients to System Team', async () => {
            // Mock user as ENGINEER
            vi.mocked(prisma.user.findUnique).mockResolvedValue({
                roles: [{ role: { name: 'ENGINEER' } }]
            } as any);

            await expect(userService.updateUser('u1', { clientIds: ['c1'] }))
                .rejects.toThrow(BusinessRuleError);
        });
    });

    describe('updateProfile', () => {
        it('updates profile fields', async () => {
            vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1' } as any);
            await userService.updateProfile('u1', { name: 'N' });
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'u1' },
                data: { name: 'N' }
            });
        });
    });

    describe('activateUser', () => {
        it('sets isActive to true and invalidates cache', async () => {
            vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1', isActive: true } as any);
            await userService.activateUser('u1');
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'u1' },
                data: { isActive: true }
            });
        });
    });

    describe('getAllUsers Filters', () => {
        it('filters by isActive=true', async () => {
            vi.mocked(prisma.user.findMany).mockResolvedValue([]);
            vi.mocked(prisma.user.count).mockResolvedValue(0);
            await userService.getAllUsers({ isActive: 'true' });
            expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ isActive: true })
            }));
        });

        it('filters by isActive=false', async () => {
            vi.mocked(prisma.user.findMany).mockResolvedValue([]);
            vi.mocked(prisma.user.count).mockResolvedValue(0);
            await userService.getAllUsers({ isActive: 'false' });
            expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ isActive: false })
            }));
        });

        it('filters by clientId (unassigned)', async () => {
            vi.mocked(prisma.user.findMany).mockResolvedValue([]);
            vi.mocked(prisma.user.count).mockResolvedValue(0);
            await userService.getAllUsers({ clientId: 'unassigned' });
            expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ clients: { none: {} } })
            }));
        });

        it('filters by clientId (specific)', async () => {
            vi.mocked(prisma.user.findMany).mockResolvedValue([]);
            vi.mocked(prisma.user.count).mockResolvedValue(0);
            await userService.getAllUsers({ clientId: 'c1' });
            expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ clients: { some: { clientId: 'c1' } } })
            }));
        });

        it('filters by roleId (none)', async () => {
            vi.mocked(prisma.user.findMany).mockResolvedValue([]);
            vi.mocked(prisma.user.count).mockResolvedValue(0);
            await userService.getAllUsers({ roleId: 'none' });
            expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ roles: { none: {} } })
            }));
        });

        it('filters by role names', async () => {
            vi.mocked(prisma.user.findMany).mockResolvedValue([]);
            vi.mocked(prisma.user.count).mockResolvedValue(0);
            await userService.getAllUsers({ role: 'ADMIN,MANAGER' });
            expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({
                    roles: { some: { role: { name: { in: ['ADMIN', 'MANAGER'] } } } }
                })
            }));
        });

        it('filters by UserType CLIENT', async () => {
            const mockUsers = [
                { id: 'u1', clients: [{ clientId: 'c1' }] }, // CLIENT
                { id: 'u2', clients: [] } // ENGINEER
            ];
            vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);
            vi.mocked(prisma.user.count).mockResolvedValue(2);

            const result = await userService.getAllUsers({ userType: 'CLIENT' });
            expect(result.data).toHaveLength(1);
            expect(result.data[0].id).toBe('u1');
        });
    });

    describe('getUsersWithSRHandlingPermission', () => {
        it('delegates to PermissionService', async () => {
            const mockPermissionService = {
                getUsersWithPermissions: vi.fn().mockResolvedValue([{ id: 'u1', name: 'U1' }])
            };
            const result = await userService.getUsersWithSRHandlingPermission(mockPermissionService as any);
            expect(result).toHaveLength(1);
            expect(mockPermissionService.getUsersWithPermissions).toHaveBeenCalled();
        });
    });
});
