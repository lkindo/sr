import { describe, expect, it, vi } from 'vitest';

import { ForbiddenError } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/permission-helpers';
import * as policies from '@/lib/policies';

describe('Policy Functions', () => {
  const adminUser: any = { id: 'user-admin', roles: ['ADMIN'], permissions: [] };
  const regularUser: any = {
    id: 'user-regular',
    roles: ['USER'],
    permissions: [PERMISSIONS.SR.READ, PERMISSIONS.SR.UPDATE_SELF],
    clientIds: ['c1'],
  };
  const clientUser: any = {
    id: 'user-client',
    roles: ['CLIENT_USER'],
    permissions: [],
    clientIds: ['c1'],
  };
  const userNoPerms: any = { id: 'user-none', roles: ['GUEST'], permissions: [] };

  describe('SR Policies', () => {
    const sr = { id: 'sr-1', clientId: 'c1', requesterId: 'user-regular' } as any;

    it('canCreateSR: verifies create permission', () => {
      const user = { ...userNoPerms, id: 'u-create', permissions: [PERMISSIONS.SR.CREATE] };
      expect(policies.canCreateSR(user)).toBe(true);
      expect(policies.canCreateSR(userNoPerms)).toBe(false);
    });

    it('canReadSR: admin can read any SR', () => {
      expect(policies.canReadSR(adminUser, sr)).toBe(true);
    });

    it('canReadSR: granular branch tests for isRequester logic', () => {
      const uId = 'user-requester';
      const cId = 'client-1';
      const srReq = { id: 's1', requesterId: uId, clientId: cId } as any;

      // 1. requesterId matches, has flag, belongs to client -> true
      const userFull = {
        id: uId,
        clientIds: [cId],
        permissions: [PERMISSIONS.SR.UPDATE_SELF],
        roles: ['USER'],
      } as any;
      expect(policies.canReadSR(userFull, srReq)).toBe(true);

      // 2. requesterId MISMATCH -> false
      const userIdMismatch = { ...userFull, id: 'other' };
      expect(policies.canReadSR(userIdMismatch, srReq)).toBe(false);

      // 3. flag MISSING -> false
      const userFlagMissing = { ...userFull, permissions: [] };
      expect(policies.canReadSR(userFlagMissing, srReq)).toBe(false);

      // 4. client MISMATCH -> false
      const userClientMismatch = { ...userFull, clientIds: ['other'] };
      expect(policies.canReadSR(userClientMismatch, srReq)).toBe(false);

      // 5. clientIds is undefined -> false
      const userClientUndef = { ...userFull, clientIds: undefined };
      expect(policies.canReadSR(userClientUndef, srReq)).toBe(false);
    });

    it('canReadSR: regular user (with global read) can read any SR', () => {
      expect(policies.canReadSR(regularUser, sr)).toBe(true);
    });

    it('canReadSR: requester belongs to client and has update_self can read', () => {
      const clientSR = { id: 's1', requesterId: 'user-client', clientId: 'c1' } as any;
      const user = { ...clientUser, permissions: [PERMISSIONS.SR.UPDATE_SELF] };
      expect(policies.canReadSR(user, clientSR)).toBe(true);
    });

    it('canReadSR: requester cannot read if NOT belonging to client', () => {
      const clientSR = { id: 's1', requesterId: 'user-client', clientId: 'other-client' } as any;
      const user = { ...clientUser, permissions: [PERMISSIONS.SR.UPDATE_SELF] };
      expect(policies.canReadSR(user, clientSR)).toBe(false);
    });

    it('canUpdateSR: admin/global update/self update logic', () => {
      expect(policies.canUpdateSR(adminUser, sr)).toBe(true);
      const userUpdate = { ...userNoPerms, id: 'u-upd', permissions: [PERMISSIONS.SR.UPDATE] };
      expect(policies.canUpdateSR(userUpdate, sr)).toBe(true);

      const requester = {
        ...userNoPerms,
        id: 'user-regular',
        permissions: [PERMISSIONS.SR.UPDATE_SELF],
      };
      expect(policies.canUpdateSR(requester, sr)).toBe(true);
      expect(policies.canUpdateSR(userNoPerms, sr)).toBe(false);
    });

    it('canUpdateSR: granular branch tests', () => {
      const uId = 'u-upd';
      const srU = { id: 's1', requesterId: uId } as any;
      const user = { id: uId, roles: ['USER'], permissions: [PERMISSIONS.SR.UPDATE_SELF] } as any;

      // self update works
      expect(policies.canUpdateSR(user, srU)).toBe(true);
      // id mismatch fails
      expect(policies.canUpdateSR({ ...user, id: 'other' }, srU)).toBe(false);
      // flag mismatch fails
      expect(policies.canUpdateSR({ ...user, permissions: [] }, srU)).toBe(false);
    });

    it('ensureCan... throws ForbiddenError on failure', () => {
      expect(() => policies.ensureCanCreateSR(userNoPerms)).toThrow(ForbiddenError);
      expect(() => policies.ensureCanReadSR(userNoPerms, sr)).toThrow(ForbiddenError);
      expect(() => policies.ensureCanUpdateSR(userNoPerms, sr)).toThrow(ForbiddenError);
      expect(() => policies.ensureCanDeleteSR(userNoPerms)).toThrow(ForbiddenError);
    });
  });

  describe('Client Policies', () => {
    const client = { id: 'c1' } as any;

    it('canReadClient: admin/global read/member logic', () => {
      expect(policies.canReadClient(adminUser, client)).toBe(true);
      const userRead = { ...userNoPerms, id: 'u-read-c', permissions: [PERMISSIONS.CLIENT.READ] };
      expect(policies.canReadClient(userRead, client)).toBe(true);
      expect(policies.canReadClient(clientUser, client)).toBe(true);

      // non-member fails
      const userOther = { ...clientUser, clientIds: ['other'] };
      expect(policies.canReadClient(userOther, client)).toBe(false);

      // clientIds undefined fails
      const userUndef = { ...clientUser, clientIds: undefined };
      expect(policies.canReadClient(userUndef, client)).toBe(false);

      expect(policies.canReadClient(userNoPerms, client)).toBe(false);

      // Without client object
      expect(policies.canReadClient(adminUser)).toBe(true);
      expect(policies.canReadClient(userNoPerms)).toBe(false);

      // Admin check for no client
      const adminNoClientPerm = { id: 'a', roles: ['ADMIN'], permissions: [] } as any;
      expect(policies.canReadClient(adminNoClientPerm)).toBe(true);
    });

    it('canCreate/Update/DeleteClient basic permissions', () => {
      const userC = { ...userNoPerms, id: 'u-c', permissions: [PERMISSIONS.CLIENT.CREATE] };
      const userU = { ...userNoPerms, id: 'u-u', permissions: [PERMISSIONS.CLIENT.UPDATE] };
      const userD = { ...userNoPerms, id: 'u-d', permissions: [PERMISSIONS.CLIENT.DELETE] };

      expect(policies.canCreateClient(userC)).toBe(true);
      expect(policies.canUpdateClient(userU)).toBe(true);
      expect(policies.canDeleteClient(userD)).toBe(true);

      expect(policies.canCreateClient(userNoPerms)).toBe(false);
    });
  });

  describe('User Policies', () => {
    const targetUser = { id: 'user-target' } as any;

    it('canReadUser: admin/global/self logic', () => {
      expect(policies.canReadUser(adminUser, targetUser)).toBe(true);
      const self = { ...userNoPerms, id: 'user-target' };
      expect(policies.canReadUser(self, targetUser)).toBe(true);
      expect(policies.canReadUser(userNoPerms, targetUser)).toBe(false);
    });

    it('canUpdateUser: admin/global/self_update logic', () => {
      expect(policies.canUpdateUser(adminUser, targetUser)).toBe(true);
      const userGlobal = {
        ...userNoPerms,
        id: 'u-upd-all',
        permissions: [PERMISSIONS.USER.UPDATE],
      };
      expect(policies.canUpdateUser(userGlobal, targetUser)).toBe(true);

      const self = {
        ...userNoPerms,
        id: 'user-target',
        permissions: [PERMISSIONS.USER.UPDATE_SELF],
      };
      expect(policies.canUpdateUser(self, targetUser)).toBe(true);

      // self but no perm flag
      const selfNoFlag = { ...userNoPerms, id: 'user-target', permissions: [] };
      expect(policies.canUpdateUser(selfNoFlag, targetUser)).toBe(false);

      expect(policies.canUpdateUser(userNoPerms, targetUser)).toBe(false);
    });

    it('canDeleteUser: user cannot delete themselves', () => {
      const self = { ...adminUser, id: 'self' };
      const target = { id: 'self' } as any;
      expect(policies.canDeleteUser(self, target)).toBe(false);
    });

    it('canDeleteUser: admin/global delete', () => {
      expect(policies.canDeleteUser(adminUser, targetUser)).toBe(true);
      const userDel = { ...userNoPerms, id: 'u-del', permissions: [PERMISSIONS.USER.DELETE] };
      expect(policies.canDeleteUser(userDel, targetUser)).toBe(true);
    });

    it('ensureCanDeleteUser throws correctly', () => {
      const self = { ...adminUser, id: 'self' };
      const target = { id: 'self' } as any;
      expect(() => policies.ensureCanDeleteUser(self, target)).toThrow(
        '자기 자신을 삭제할 수 없습니다.'
      );
      expect(() => policies.ensureCanDeleteUser(userNoPerms, targetUser)).toThrow(ForbiddenError);
    });
  });

  describe('Role Policies', () => {
    const adminRole = { name: 'ADMIN' } as any;
    const userRole = { name: 'USER' } as any;
    const customRole = { name: 'CUSTOM' } as any;

    it('canUpdateRole: cannot update ADMIN role', () => {
      expect(policies.canUpdateRole(adminUser, adminRole)).toBe(false);
      expect(policies.canUpdateRole(adminUser, customRole)).toBe(true);
    });

    it('canDeleteRole: cannot delete system roles', () => {
      expect(policies.canDeleteRole(adminUser, userRole)).toBe(false);
      expect(policies.canDeleteRole(adminUser, customRole)).toBe(true);
    });

    it('canAssignRole: only admin can assign ADMIN role', () => {
      expect(policies.canAssignRole(adminUser, adminRole)).toBe(true);
      expect(policies.canAssignRole(regularUser, adminRole)).toBe(false);

      const userAssign = { ...userNoPerms, id: 'u-assign', permissions: [PERMISSIONS.ROLE.ASSIGN] };
      expect(policies.canAssignRole(userAssign, customRole)).toBe(true);
    });

    it('ensureCanUpdate/Delete/AssignRole throws correctly', () => {
      expect(() => policies.ensureCanUpdateRole(adminUser, adminRole)).toThrow(
        'ADMIN 역할은 수정할 수 없습니다.'
      );
      expect(() => policies.ensureCanDeleteRole(adminUser, userRole)).toThrow(
        '시스템 역할은 삭제할 수 없습니다.'
      );
      expect(() => policies.ensureCanAssignRole(regularUser, adminRole)).toThrow(
        'ADMIN 역할 할당은 ADMIN만 가능합니다.'
      );
    });
  });
});
