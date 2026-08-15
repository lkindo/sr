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
      expect(policies.canCreateSR(adminUser)).toBe(true); // ADMIN implicitly has permission
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

      // ENGINEER 권한 사용자는 자신에게 배정되지 않은 SR은 수정 불가 (false)
      const userUpdate = {
        ...userNoPerms,
        id: 'u-upd',
        roles: ['ENGINEER'],
        permissions: [PERMISSIONS.SR.UPDATE],
      };
      expect(policies.canUpdateSR(userUpdate, sr)).toBe(false);

      // ENGINEER 권한 사용자가 본인에게 배정된 SR은 수정 가능 (true)
      const assignedSR = { ...sr, assigneeId: 'u-upd' };
      expect(policies.canUpdateSR(userUpdate, assignedSR)).toBe(true);

      const requester = {
        ...userNoPerms,
        id: 'user-regular',
        permissions: [PERMISSIONS.SR.UPDATE_SELF],
        clientIds: ['c1'],
      };
      expect(policies.canUpdateSR(requester, sr)).toBe(true);
      expect(policies.canUpdateSR(userNoPerms, sr)).toBe(false);
    });

    describe('canDeleteAttachment', () => {
      // 이 규칙은 한동안 화면(SRDetail 의 canDelete)에만 있었고 API 는 canUpdateSR 만 봤다.
      // 아래 첫 단언이 그 간극을 고정한다 — 수정 권한과 첨부 삭제 권한은 같지 않다.
      const intakeSR = {
        id: 'sr-att',
        clientId: 'c1',
        requesterId: 'user-owner',
        status: 'INTAKE',
      } as any;
      const owner: any = {
        id: 'user-owner',
        roles: ['CLIENT_USER'],
        permissions: [PERMISSIONS.SR.UPDATE_SELF],
        clientIds: ['c1'],
      };

      it('신청자라도 접수 이후에는 지울 수 없다 — 수정 권한과 구분된다', () => {
        expect(policies.canUpdateSR(owner, intakeSR)).toBe(true); // 수정은 가능하지만
        expect(policies.canDeleteAttachment(owner, intakeSR)).toBe(false); // 첨부 삭제는 불가
      });

      it('신청자는 접수 전(REQUESTED)에는 지울 수 있다', () => {
        expect(policies.canDeleteAttachment(owner, { ...intakeSR, status: 'REQUESTED' })).toBe(
          true
        );
      });

      it('ADMIN·MANAGER 는 상태와 무관하게 지울 수 있다', () => {
        expect(policies.canDeleteAttachment(adminUser, intakeSR)).toBe(true);
        const manager: any = {
          id: 'user-mgr',
          roles: ['MANAGER'],
          permissions: [PERMISSIONS.SR.UPDATE],
          clientIds: [],
        };
        expect(policies.canDeleteAttachment(manager, intakeSR)).toBe(true);
      });

      it('SR 자체를 못 고치는 사람은 첨부도 못 지운다', () => {
        expect(policies.canDeleteAttachment(userNoPerms, intakeSR)).toBe(false);
      });

      it('ensureCanDeleteAttachment 는 거부 시 ForbiddenError 를 던진다', () => {
        expect(() => policies.ensureCanDeleteAttachment(owner, intakeSR)).toThrow(ForbiddenError);
        expect(() =>
          policies.ensureCanDeleteAttachment(owner, { ...intakeSR, status: 'REQUESTED' })
        ).not.toThrow();
      });
    });

    it('canUpdateSR: granular branch tests', () => {
      const uId = 'u-upd';
      const srU = { id: 's1', requesterId: uId, clientId: 'c1' } as any;
      const user = {
        id: uId,
        roles: ['USER'],
        permissions: [PERMISSIONS.SR.UPDATE_SELF],
        clientIds: ['c1'],
      } as any;

      // self update works
      expect(policies.canUpdateSR(user, srU)).toBe(true);
      // id mismatch fails
      expect(policies.canUpdateSR({ ...user, id: 'other' }, srU)).toBe(false);
      // flag mismatch fails
      expect(policies.canUpdateSR({ ...user, permissions: [] }, srU)).toBe(false);
    });

    it('canDeleteSR: verifies delete permission', () => {
      // 외부 사용자는 권한 + 소속이 **둘 다** 있어야 한다.
      // (`userNoPerms` 는 clientIds 가 없으므로 권한만 준 상태로는 통과하지 못한다 —
      //  그것이 이 수정으로 닫힌 구멍이다.)
      const user = {
        ...userNoPerms,
        id: 'u-del',
        permissions: [PERMISSIONS.SR.DELETE],
        clientIds: ['c1'],
      };
      expect(policies.canDeleteSR(user, sr)).toBe(true);
      expect(policies.canDeleteSR(adminUser, sr)).toBe(true); // ADMIN implicitly has permission
      expect(policies.canDeleteSR(userNoPerms, sr)).toBe(false);
    });

    it('canDeleteSR: 권한은 있으나 소속이 없는 외부 사용자는 거부한다', () => {
      const orphan = { ...userNoPerms, id: 'u-orphan', permissions: [PERMISSIONS.SR.DELETE] };
      expect(policies.canDeleteSR(orphan, sr)).toBe(false);
    });

    it('canDeleteSR: 외부 사용자는 다른 테넌트의 SR 을 지울 수 없다', () => {
      // 예전에는 `sr` 인자 자체가 없어 SR:DELETE 만 있으면 아무 SR 이나 지울 수 있었다.
      const outsider = {
        ...userNoPerms,
        id: 'u-outsider',
        roles: ['CLIENT_ADMIN'],
        permissions: [PERMISSIONS.SR.DELETE],
        clientIds: ['other-client'],
      };
      expect(policies.canDeleteSR(outsider, sr)).toBe(false);
    });

    it('canDeleteSR: 내부 사용자는 권한만으로 통과한다', () => {
      const engineer = {
        ...userNoPerms,
        id: 'u-eng',
        roles: ['ENGINEER'],
        permissions: [PERMISSIONS.SR.DELETE],
        clientIds: [],
      };
      expect(policies.canDeleteSR(engineer, sr)).toBe(true);
    });

    it('ensureCan... throws ForbiddenError on failure', () => {
      expect(() => policies.ensureCanCreateSR(userNoPerms)).toThrow(ForbiddenError);
      expect(() => policies.ensureCanReadSR(userNoPerms, sr)).toThrow(ForbiddenError);
      expect(() => policies.ensureCanUpdateSR(userNoPerms, sr)).toThrow(ForbiddenError);
      expect(() => policies.ensureCanDeleteSR(userNoPerms, sr)).toThrow(ForbiddenError);
    });
  });

  describe('Client Policies', () => {
    const client = { id: 'c1' } as any;

    it('canReadClient: ADMIN은 소속과 무관하게 고객사 상세를 조회할 수 있다', () => {
      expect(policies.canReadClient(adminUser, client)).toBe(true);
    });

    it('canReadClient: 내부 사용자(MANAGER)는 CLIENT:READ 플래그로 고객사 상세를 조회할 수 있다', () => {
      const internalReader = {
        ...userNoPerms,
        id: 'u-internal-read-c',
        roles: ['MANAGER'],
        permissions: [PERMISSIONS.CLIENT.READ],
        clientIds: [],
      };
      expect(policies.canReadClient(internalReader, client)).toBe(true);
    });

    it('canReadClient: 외부 사용자는 CLIENT:READ 플래그만으로 타 고객사 상세를 조회할 수 없다 (테넌트 격리)', () => {
      const externalReader = {
        ...userNoPerms,
        id: 'u-external-read-c',
        roles: ['CLIENT_USER'],
        permissions: [PERMISSIONS.CLIENT.READ],
        clientIds: ['other'],
      };
      expect(policies.canReadClient(externalReader, client)).toBe(false);
      expect(() => policies.ensureCanReadClient(externalReader, client)).toThrow(ForbiddenError);

      // 플래그가 있어도 소속 정보 자체가 없으면 차단
      const externalNoMembership = {
        ...externalReader,
        id: 'u-external-no-membership',
        clientIds: undefined,
      };
      expect(policies.canReadClient(externalNoMembership, client)).toBe(false);
    });

    it('canReadClient: 외부 사용자라도 해당 고객사 소속이면 상세를 조회할 수 있다', () => {
      expect(policies.canReadClient(clientUser, client)).toBe(true);
      expect(() => policies.ensureCanReadClient(clientUser, client)).not.toThrow();
    });

    it('canReadClient: 비소속/무권한 사용자는 상세 조회 불가', () => {
      // non-member fails
      const userOther = { ...clientUser, clientIds: ['other'] };
      expect(policies.canReadClient(userOther, client)).toBe(false);

      // clientIds undefined fails
      const userUndef = { ...clientUser, clientIds: undefined };
      expect(policies.canReadClient(userUndef, client)).toBe(false);

      expect(policies.canReadClient(userNoPerms, client)).toBe(false);
    });

    it('canReadClient: 목록 조회(client 미지정)는 플래그 기준으로 판정된다', () => {
      // Without client object
      expect(policies.canReadClient(adminUser)).toBe(true);
      expect(policies.canReadClient(userNoPerms)).toBe(false);

      // Admin check for no client
      const adminNoClientPerm = { id: 'a', roles: ['ADMIN'], permissions: [] } as any;
      expect(policies.canReadClient(adminNoClientPerm)).toBe(true);

      // 목록은 라우트에서 clientIds 로 스코프되므로 외부 사용자도 플래그만으로 통과한다
      const externalReader = {
        ...userNoPerms,
        id: 'u-external-list-c',
        roles: ['CLIENT_USER'],
        permissions: [PERMISSIONS.CLIENT.READ],
        clientIds: ['other'],
      };
      expect(policies.canReadClient(externalReader)).toBe(true);
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
    // UserIdentity 는 소속 고객사(clients)를 함께 실어 테넌트 판정을 수행한다.
    const targetUser = { id: 'user-target', clients: [{ clientId: 'c1' }] } as any;
    const foreignTargetUser = { id: 'user-foreign', clients: [{ clientId: 'other' }] } as any;

    it('canReadUser: ADMIN과 본인은 항상 조회 가능하고, 무권한 사용자는 불가', () => {
      expect(policies.canReadUser(adminUser, targetUser)).toBe(true);
      const self = { ...userNoPerms, id: 'user-target' };
      expect(policies.canReadUser(self, targetUser)).toBe(true);
      expect(policies.canReadUser(userNoPerms, targetUser)).toBe(false);
    });

    it('canReadUser: 내부 사용자(MANAGER)는 USER:READ 플래그로 타 고객사 사용자도 조회 가능', () => {
      const internalReader = {
        ...userNoPerms,
        id: 'u-internal-read-u',
        roles: ['MANAGER'],
        permissions: [PERMISSIONS.USER.READ],
        clientIds: [],
      };
      expect(policies.canReadUser(internalReader, foreignTargetUser)).toBe(true);
    });

    it('canReadUser: 외부 사용자는 USER:READ 플래그만으로 타 고객사 사용자를 조회할 수 없다 (테넌트 격리)', () => {
      const externalReader = {
        ...userNoPerms,
        id: 'u-external-read-u',
        roles: ['CLIENT_USER'],
        permissions: [PERMISSIONS.USER.READ],
        clientIds: ['c1'],
      };
      expect(policies.canReadUser(externalReader, foreignTargetUser)).toBe(false);
      expect(() => policies.ensureCanReadUser(externalReader, foreignTargetUser)).toThrow(
        ForbiddenError
      );

      // 대상의 소속 정보가 없으면(테넌트 특정 불가) 차단
      const targetNoMembership = { id: 'user-unknown-tenant', clients: [] } as any;
      expect(policies.canReadUser(externalReader, targetNoMembership)).toBe(false);
    });

    it('canReadUser: 외부 사용자는 고객사를 공유하는 사용자와 본인은 조회 가능', () => {
      const externalReader = {
        ...userNoPerms,
        id: 'u-external-read-u',
        roles: ['CLIENT_USER'],
        permissions: [PERMISSIONS.USER.READ],
        clientIds: ['c1'],
      };
      // 같은 고객사(c1)를 공유하는 대상 -> 허용
      expect(policies.canReadUser(externalReader, targetUser)).toBe(true);

      // 본인은 소속 정보와 무관하게 항상 허용
      const selfIdentity = { id: 'u-external-read-u', clients: [] } as any;
      expect(policies.canReadUser(externalReader, selfIdentity)).toBe(true);
    });

    it('canUpdateUser: ADMIN과 본인(UPDATE_SELF)은 수정 가능', () => {
      expect(policies.canUpdateUser(adminUser, targetUser)).toBe(true);

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

    it('canUpdateUser: 내부 사용자(MANAGER)는 USER:UPDATE 플래그로 타 고객사 사용자도 수정 가능', () => {
      const internalUpdater = {
        ...userNoPerms,
        id: 'u-internal-upd',
        roles: ['MANAGER'],
        permissions: [PERMISSIONS.USER.UPDATE],
        clientIds: [],
      };
      expect(policies.canUpdateUser(internalUpdater, foreignTargetUser)).toBe(true);
    });

    it('canUpdateUser: 외부 사용자는 USER:UPDATE 플래그만으로 타 고객사 사용자를 수정할 수 없다 (테넌트 격리)', () => {
      const externalUpdater = {
        ...userNoPerms,
        id: 'u-external-upd',
        roles: ['CLIENT_USER'],
        permissions: [PERMISSIONS.USER.UPDATE],
        clientIds: ['c1'],
      };
      expect(policies.canUpdateUser(externalUpdater, foreignTargetUser)).toBe(false);
      expect(() => policies.ensureCanUpdateUser(externalUpdater, foreignTargetUser)).toThrow(
        ForbiddenError
      );

      // 대상의 소속이 액터의 소속을 벗어나면(부분 포함) 차단
      const straddlingTarget = {
        id: 'user-straddling',
        clients: [{ clientId: 'c1' }, { clientId: 'other' }],
      } as any;
      expect(policies.canUpdateUser(externalUpdater, straddlingTarget)).toBe(false);

      // 액터/대상 어느 한쪽이라도 소속이 비면 차단
      const targetNoMembership = { id: 'user-unknown-tenant', clients: [] } as any;
      expect(policies.canUpdateUser(externalUpdater, targetNoMembership)).toBe(false);
      const actorNoMembership = { ...externalUpdater, clientIds: undefined };
      expect(policies.canUpdateUser(actorNoMembership, targetUser)).toBe(false);
    });

    it('canUpdateUser: 외부 사용자는 자신의 고객사에 포함된 사용자는 수정 가능', () => {
      const externalUpdater = {
        ...userNoPerms,
        id: 'u-external-upd',
        roles: ['CLIENT_USER'],
        permissions: [PERMISSIONS.USER.UPDATE],
        clientIds: ['c1', 'c2'],
      };
      expect(policies.canUpdateUser(externalUpdater, targetUser)).toBe(true);
      expect(() => policies.ensureCanUpdateUser(externalUpdater, targetUser)).not.toThrow();
    });

    it('canDeleteUser: user cannot delete themselves', () => {
      const self = { ...adminUser, id: 'self' };
      const target = { id: 'self' } as any;
      expect(policies.canDeleteUser(self, target)).toBe(false);
    });

    it('canDeleteUser: admin and internal operator can delete globally', () => {
      expect(policies.canDeleteUser(adminUser, targetUser)).toBe(true);
      const internalDeleter = {
        ...userNoPerms,
        id: 'u-del',
        roles: ['MANAGER'],
        permissions: [PERMISSIONS.USER.DELETE],
      };
      expect(policies.canDeleteUser(internalDeleter, targetUser)).toBe(true);
    });

    it('canDeleteUser: permission alone does not bypass tenant scope', () => {
      const externalDeleter = {
        ...userNoPerms,
        id: 'u-external-del',
        roles: ['CLIENT_ADMIN'],
        permissions: [PERMISSIONS.USER.DELETE],
        clientIds: ['c1'],
      };
      expect(policies.canDeleteUser(externalDeleter, targetUser)).toBe(true);
      expect(policies.canDeleteUser({ ...externalDeleter, clientIds: ['other'] }, targetUser)).toBe(
        false
      );
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
