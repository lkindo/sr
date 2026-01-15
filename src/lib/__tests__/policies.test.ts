import { describe, it, expect, vi } from 'vitest';
import * as policies from '@/lib/policies';
import { PERMISSIONS } from '@/lib/permission-helpers';

describe('Policy Functions', () => {
    const adminUser: any = { id: 'u1', roles: ['ADMIN'], permissions: [] };
    const regularUser: any = { id: 'u2', roles: ['USER'], permissions: [PERMISSIONS.SR.READ, PERMISSIONS.SR.UPDATE_SELF], clientIds: ['c1'] };
    const clientUser: any = { id: 'u3', roles: ['CLIENT_USER'], permissions: [], clientIds: ['c1'] };

    describe('SR Policies', () => {
        const sr = { id: 'sr-1', clientId: 'c1', requesterId: 'u2' } as any;

        it('canReadSR: admin can read any SR', () => {
            expect(policies.canReadSR(adminUser, sr)).toBe(true);
        });

        it('canReadSR: regular user (with global read) can read any SR', () => {
            expect(policies.canReadSR(regularUser, sr)).toBe(true);
        });

        it('canReadSR: client user (no global read) can read SR if requester and belongs to client', () => {
            const clientSR = { ...sr, requesterId: 'u3', clientId: 'c1' };
            const clientUserWithSelfUpdate = { ...clientUser, permissions: [PERMISSIONS.SR.UPDATE_SELF] };
            expect(policies.canReadSR(clientUserWithSelfUpdate, clientSR)).toBe(true);
        });

        it('canReadSR: client user cannot read SR of another client', () => {
            const otherSR = { ...sr, clientId: 'c2', requesterId: 'u3' };
            expect(policies.canReadSR(clientUser, otherSR)).toBe(false);
        });
    });

    describe('User Policies', () => {
        const targetUser = { id: 'u2' } as any;

        it('canDeleteUser: user cannot delete themselves', () => {
            expect(policies.canDeleteUser(regularUser, targetUser)).toBe(false);
        });

        it('canDeleteUser: admin can delete others', () => {
            expect(policies.canDeleteUser(adminUser, targetUser)).toBe(true);
        });
    });

    describe('Role Policies', () => {
        const adminRole = { name: 'ADMIN' } as any;
        const userRole = { name: 'USER' } as any;

        it('canUpdateRole: cannot update ADMIN role even if admin', () => {
            expect(policies.canUpdateRole(adminUser, adminRole)).toBe(false);
        });

        it('canDeleteRole: cannot delete system roles', () => {
            expect(policies.canDeleteRole(adminUser, userRole)).toBe(false);
        });

        it('canAssignRole: only admin can assign ADMIN role', () => {
            expect(policies.canAssignRole(adminUser, adminRole)).toBe(true);
            expect(policies.canAssignRole(regularUser, adminRole)).toBe(false);
        });
    });

    describe('Client Policies', () => {
        it('canReadClient: member of client can read client', () => {
            const client = { id: 'c1' } as any;
            expect(policies.canReadClient(regularUser, client)).toBe(true);
        });

        it('canReadClient: non-member cannot read client if no global read permission', () => {
            const client = { id: 'c2' } as any;
            expect(policies.canReadClient(regularUser, client)).toBe(false);
        });

        it('canUpdateClient: admin can update client', () => {
            expect(policies.canUpdateClient(adminUser)).toBe(true);
        });
    });
});
