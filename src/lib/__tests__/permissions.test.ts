import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasPermission, requirePermission, hasAnyPermission, hasAllPermissions } from '@/lib/permissions';

const mocks = vi.hoisted(() => ({
    checkPermission: vi.fn(),
    checkRole: vi.fn(),
    getUserPermissions: vi.fn(),
    getUserRoles: vi.fn(),
}));

vi.mock('@/services/permission.service', () => ({
    PermissionService: vi.fn().mockImplementation(function (this: any) {
        return mocks;
    }),
}));

describe('permissions utility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('hasPermission', () => {
        it('should return true if permission service returns true', async () => {
            mocks.checkPermission.mockResolvedValue(true);

            const result = await hasPermission('user-1', 'SR', 'READ');
            expect(result).toBe(true);
            expect(mocks.checkPermission).toHaveBeenCalledWith('user-1', 'SR:READ');
        });

        it('should return false if permission service returns false', async () => {
            mocks.checkPermission.mockResolvedValue(false);
            const result = await hasPermission('user-1', 'SR', 'DELETE');
            expect(result).toBe(false);
        });

        it('should return false if service throws error', async () => {
            mocks.checkPermission.mockRejectedValue(new Error('DB Error'));
            const result = await hasPermission('user-1', 'SR', 'READ');
            expect(result).toBe(false);
        });
    });

    describe('requirePermission', () => {
        it('should not throw if permission is granted', async () => {
            mocks.checkPermission.mockResolvedValue(true);
            await expect(requirePermission('user-1', 'SR', 'READ')).resolves.not.toThrow();
        });

        it('should throw if permission is denied', async () => {
            mocks.checkPermission.mockResolvedValue(false);
            await expect(requirePermission('user-1', 'SR', 'DELETE')).rejects.toThrow('권한이 없습니다');
        });
    });

    describe('hasAnyPermission', () => {
        it('should return true if at least one permission is granted', async () => {
            mocks.checkPermission
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            const result = await hasAnyPermission('user-1', [
                { resource: 'SR', action: 'DELETE' },
                { resource: 'SR', action: 'READ' }
            ]);
            expect(result).toBe(true);
        });
    });
});
