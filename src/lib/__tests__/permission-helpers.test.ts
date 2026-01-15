import { describe, it, expect } from 'vitest';
import { hasPermissionFlag, hasAnyPermissionFlag, hasAllPermissionFlags, PERMISSIONS } from '@/lib/permission-helpers';
import { AuthenticatedUser } from '@/types/session';

describe('permission-helpers', () => {
    const mockUser: AuthenticatedUser = {
        id: 'user-1',
        email: 'test@test.com',
        name: 'Test User',
        image: null,
        roles: ['USER'],
        permissions: [PERMISSIONS.SR.READ, PERMISSIONS.SR.CREATE],
        clientIds: [],
    };

    describe('hasPermissionFlag', () => {
        it('should return true if user has the permission', () => {
            expect(hasPermissionFlag(mockUser, PERMISSIONS.SR.READ)).toBe(true);
        });

        it('should return false if user does not have the permission', () => {
            expect(hasPermissionFlag(mockUser, PERMISSIONS.SR.DELETE)).toBe(false);
        });

        it('should return false if user has no permissions array', () => {
            const userWithoutPerms = { ...mockUser, permissions: undefined } as any;
            expect(hasPermissionFlag(userWithoutPerms, PERMISSIONS.SR.READ)).toBe(false);
        });
    });

    describe('hasAnyPermissionFlag', () => {
        it('should return true if user has at least one of the permissions', () => {
            expect(hasAnyPermissionFlag(mockUser, [PERMISSIONS.SR.READ, PERMISSIONS.SR.DELETE])).toBe(true);
        });

        it('should return false if user has none of the permissions', () => {
            expect(hasAnyPermissionFlag(mockUser, [PERMISSIONS.SR.DELETE, PERMISSIONS.CLIENT.CREATE])).toBe(false);
        });
    });

    describe('hasAllPermissionFlags', () => {
        it('should return true if user has all of the permissions', () => {
            expect(hasAllPermissionFlags(mockUser, [PERMISSIONS.SR.READ, PERMISSIONS.SR.CREATE])).toBe(true);
        });

        it('should return false if user is missing one of the permissions', () => {
            expect(hasAllPermissionFlags(mockUser, [PERMISSIONS.SR.READ, PERMISSIONS.SR.DELETE])).toBe(false);
        });
    });
});
