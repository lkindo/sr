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

/**
 * 내부 댓글 가시성 — 상세·댓글 탭·REST GET·목록 댓글 수·내 요청 댓글 수가 **모두** 이 판정을 쓴다.
 * 예전에는 세 경로가 같은 삼항식을 각자 복제했고, 목록·내 요청의 댓글 수는 아예 필터가 없어
 * 내부 댓글이 생기면 고객사 사용자의 목록에 그 개수가 섞일 상태였다.
 */
describe('visibleCommentsWhere', () => {
  const base = {
    id: 'u-1',
    email: 'u@example.com',
    name: null,
    image: null,
    permissions: [],
    // 판정은 역할로만 한다 — 소속 고객사가 있어도 내부 역할이면 내부 사용자다.
    clientIds: ['c1'],
  };

  it.each(['ADMIN', 'MANAGER', 'ENGINEER'])('내부 사용자(%s)에게는 걸러 내지 않는다', (role) => {
    expect(policies.visibleCommentsWhere({ ...base, roles: [role] })).toEqual({});
  });

  it.each(['CLIENT_ADMIN', 'CLIENT_USER', 'USER'])(
    '외부 사용자(%s)에게는 내부 댓글을 뺀다',
    (role) => {
      expect(policies.visibleCommentsWhere({ ...base, roles: [role] })).toEqual({
        isInternal: false,
      });
    }
  );

  it('역할이 비어 있으면 외부 사용자로 닫힌다(fail-closed)', () => {
    expect(policies.visibleCommentsWhere({ ...base, roles: [] })).toEqual({ isInternal: false });
  });
});

/**
 * 남에게 배정된 SR 을 접수로 가져가기 — 헌법 §1.1 "타 엔지니어에게 할당된 SR은 임의로 변경할 수 없다".
 * 판정은 목록·상세와 같은 담당자 스코프(resolveAssigneeScope)를 따른다.
 */
describe('canIntakeAssignedSR', () => {
  const user = (roles: string[], permissions: string[] = ['SR:READ']) => ({
    id: 'me',
    email: 'me@example.com',
    name: null,
    image: null,
    roles,
    permissions,
    clientIds: [],
  });

  it('미배정 SR 은 이 함수가 막지 않는다(접수 범위는 역할 게이트가 판정)', () => {
    expect(policies.canIntakeAssignedSR(user(['ENGINEER']), { assigneeId: null })).toBe(true);
  });

  it('ENGINEER 는 자기 배정분만 접수하고, 남의 배정분은 가져갈 수 없다', () => {
    expect(policies.canIntakeAssignedSR(user(['ENGINEER']), { assigneeId: 'me' })).toBe(true);
    expect(policies.canIntakeAssignedSR(user(['ENGINEER']), { assigneeId: 'other' })).toBe(false);
    expect(() =>
      policies.ensureCanIntakeAssignedSR(user(['ENGINEER']), { assigneeId: 'other' })
    ).toThrow('다른 담당자에게 배정된 SR은 접수할 수 없습니다.');
  });

  it.each([['ADMIN'], ['MANAGER']])('%s 는 남에게 배정된 SR 도 재배정할 수 있다', (role) => {
    expect(policies.canIntakeAssignedSR(user([role]), { assigneeId: 'other' })).toBe(true);
  });
});

/**
 * 외부 사용자의 SR **내용 수정** — PRD §특수 권한 규칙 "SR 소유자: SR을 생성한 사용자는 REQUESTED
 * 상태에서만 수정 가능". 이 규칙은 화면(수정 버튼·다이얼로그)에만 있어서, API 로는 접수·완료 뒤에도
 * 제목·본문과 운영자가 쓴 완료 내용·거절 사유를 덮어쓰거나 지울 수 있었다.
 *  - 신청자가 아닌 외부 사용자의 접수 후 수정 범위는 정책 미결이라 여기서 막지 않는다.
 *  - 운영자(내부 사용자·SR:ASSIGN 보유자)의 접수 후 수정 범위도 정책 미결이라 막지 않는다.
 *  - 상태 전이 요청도 지나되, 전이 전용 값만 빼고 본다(전이에 내용 수정을 끼워 넣는 우회 차단).
 */
describe('ensureCanEditSRContent', () => {
  const user = (roles: string[], permissions: string[] = [], id = 'u') => ({
    id,
    email: 'u@example.com',
    name: null,
    image: null,
    roles,
    permissions,
    clientIds: ['c1'],
  });
  const requester = user(['CLIENT_USER']);
  const own = (status: string) => ({ status, requesterId: requester.id });

  it('신청자는 접수 전(REQUESTED) SR 의 요청 내용을 고칠 수 있다', () => {
    expect(() =>
      policies.ensureCanEditSRContent(requester, own('REQUESTED'), { title: '새 제목' })
    ).not.toThrow();
  });

  it.each(['INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CONFIRMED', 'REJECTED'])(
    '신청자는 %s 상태 SR 의 내용을 고칠 수 없다',
    (status) => {
      expect(() =>
        policies.ensureCanEditSRContent(requester, own(status), { title: '새 제목' })
      ).toThrow('SR이 접수된 뒤에는 요청 내용을 직접 수정할 수 없습니다');
    }
  );

  it.each([['resolutionDescription'], ['rejectionReason']])(
    '외부 사용자는 REQUESTED 에서도 운영자 필드 %s 를 쓸 수 없다',
    (field) => {
      expect(() =>
        policies.ensureCanEditSRContent(requester, own('REQUESTED'), { [field]: '임의 값' })
      ).toThrow('완료 내용과 거절 사유는 운영 담당자만 작성할 수 있습니다.');
    }
  );

  it('만족도·추가 의견은 고객 소유 값이라 접수 후에도 남길 수 있다', () => {
    expect(() =>
      policies.ensureCanEditSRContent(requester, own('COMPLETED'), {
        satisfactionRating: 5,
        additionalFeedback: '감사합니다',
      })
    ).not.toThrow();
  });

  it('피드백에 다른 필드를 섞으면 접수 후에는 막는다', () => {
    expect(() =>
      policies.ensureCanEditSRContent(requester, own('COMPLETED'), {
        satisfactionRating: 5,
        title: '제목도 바꾸기',
      })
    ).toThrow('SR이 접수된 뒤에는 요청 내용을 직접 수정할 수 없습니다');
  });

  it('상태 값이 현재와 같으면(전이 아님) 내용 수정으로 치지 않는다', () => {
    expect(() =>
      policies.ensureCanEditSRContent(requester, own('COMPLETED'), { status: 'COMPLETED' })
    ).not.toThrow();
  });

  describe('상태 전이 요청', () => {
    // status 라우트가 전이마다 싣는 값 그대로다. 전이 권한 자체는 상태머신이 판정한다.
    it.each([
      ['확인', 'COMPLETED', { status: 'CONFIRMED', changeReason: '상태 변경' }],
      ['확인 + 만족도', 'COMPLETED', { status: 'CONFIRMED', satisfactionRating: 5 }],
      ['재오픈', 'COMPLETED', { status: 'IN_PROGRESS', changeReason: '재발', assigneeId: 'e1' }],
      ['거절', 'REQUESTED', { status: 'REJECTED', rejectionReason: '중복 요청' }],
      ['거절(접수 후)', 'INTAKE', { status: 'REJECTED', rejectionReason: '범위 밖' }],
      ['완료', 'IN_PROGRESS', { status: 'COMPLETED', resolutionDescription: '조치함' }],
      ['보류', 'IN_PROGRESS', { status: 'ON_HOLD', expectedHoldReleaseDate: '2026-10-01' }],
      ['재개', 'ON_HOLD', { status: 'IN_PROGRESS', expectedHoldReleaseDate: null }],
    ])('%s 전이에 실린 전이 전용 값은 이 함수가 막지 않는다', (_label, from, changes) => {
      expect(() => policies.ensureCanEditSRContent(requester, own(from), changes)).not.toThrow();
    });

    it('전이에 제목 수정을 끼워 넣으면 막는다', () => {
      expect(() =>
        policies.ensureCanEditSRContent(requester, own('COMPLETED'), {
          status: 'CONFIRMED',
          title: '확인하면서 제목도 바꾸기',
        })
      ).toThrow('SR이 접수된 뒤에는 요청 내용을 직접 수정할 수 없습니다');
    });

    it('다른 전이의 전용 값은 끼워 넣을 수 없다 — 확인하면서 완료 내용을 덮어쓰기', () => {
      expect(() =>
        policies.ensureCanEditSRContent(requester, own('COMPLETED'), {
          status: 'CONFIRMED',
          resolutionDescription: '고객이 바꾼 완료 내용',
        })
      ).toThrow('완료 내용과 거절 사유는 운영 담당자만 작성할 수 있습니다.');
    });
  });

  // 소유자 결정(2026-09-18): 접수 이후 SR 내용은 운영자만 고친다. 신청자가 아닌 고객사 관리자도 예외가
  // 아니다 — 요구 범위가 조용히 바뀌면 접수 시점에 산정한 SLA 의 근거가 흔들린다.
  it('신청자가 아닌 외부 사용자(고객사 관리자)도 접수 후에는 내용을 고칠 수 없다', () => {
    const clientAdmin = user(['CLIENT_ADMIN'], ['SR:UPDATE'], 'client-admin');
    expect(() =>
      policies.ensureCanEditSRContent(clientAdmin, own('IN_PROGRESS'), { title: '새 제목' })
    ).toThrow('SR이 접수된 뒤에는 요청 내용을 직접 수정할 수 없습니다');
    expect(() =>
      policies.ensureCanEditSRContent(clientAdmin, own('REQUESTED'), { title: '새 제목' })
    ).not.toThrow();
    // 운영자 값은 신청자 여부와 무관하게 막는다.
    expect(() =>
      policies.ensureCanEditSRContent(clientAdmin, own('IN_PROGRESS'), {
        resolutionDescription: '임의 값',
      })
    ).toThrow('완료 내용과 거절 사유는 운영 담당자만 작성할 수 있습니다.');
  });

  it.each([['ADMIN'], ['MANAGER'], ['ENGINEER']])(
    '운영자(%s)는 접수 후에도 내용을 고칠 수 있다(ENGINEER 의 배정 범위는 ensureCanUpdateSR 이 본다)',
    (role) => {
      expect(() =>
        policies.ensureCanEditSRContent(user([role], [], 'u'), own('IN_PROGRESS'), {
          title: '새 제목',
          resolutionDescription: '내용',
        })
      ).not.toThrow();
    }
  );

  it('SR:ASSIGN 을 받은 외부 운영 역할은 운영자 필드 규칙과 같게 운영자로 본다', () => {
    const externalOperator = user(['CLIENT_USER'], ['SR:ASSIGN']);
    expect(policies.canWriteSROperatorFields(externalOperator)).toBe(true);
    expect(() =>
      policies.ensureCanEditSRContent(externalOperator, own('IN_PROGRESS'), {
        resolutionDescription: '조치 내용',
      })
    ).not.toThrow();
  });
});

describe('canWriteSROperatorFields', () => {
  const user = (roles: string[], permissions: string[] = []) => ({
    id: 'u',
    email: 'u@example.com',
    name: null,
    image: null,
    roles,
    permissions,
    clientIds: [],
  });

  it.each([['ADMIN'], ['MANAGER'], ['ENGINEER']])('내부 사용자(%s)는 운영자다', (role) => {
    expect(policies.canWriteSROperatorFields(user([role]))).toBe(true);
  });

  it.each([['CLIENT_USER'], ['CLIENT_ADMIN']])('SR:ASSIGN 없는 %s 는 운영자가 아니다', (role) => {
    expect(policies.canWriteSROperatorFields(user([role], ['SR:UPDATE']))).toBe(false);
  });
});

/**
 * 고객사 화면의 SR 요약·건수와 사용자 명부 — 헌법 §1.2: ENGINEER 는 고객사 명부·서비스 카테고리는
 * 전체를 보지만 "SR 본문·고객사 사용자 정보·SR 통계는 자신에게 배정된 범위로 제한". 예전에는 고객사
 * 상세·목록·조직도가 ENGINEER 에게 전 고객사의 사용자(이름·이메일·역할)와 최근 SR·SR 건수를 보여 줬다.
 * 판정은 목록·상세와 같은 담당자 스코프(resolveAssigneeScope)를 따른다.
 */
describe('고객사 화면의 SR 스코프·사용자 명부', () => {
  const user = (roles: string[], permissions: string[] = ['SR:READ']) => ({
    id: 'me',
    email: 'me@example.com',
    name: null,
    image: null,
    roles,
    permissions,
    clientIds: [],
  });

  it('ENGINEER 는 자기 배정 SR 만 세고, 사용자 명부를 받지 않는다', () => {
    expect(policies.clientSrScopeWhere(user(['ENGINEER']))).toEqual({ assigneeId: 'me' });
    expect(policies.canViewClientRoster(user(['ENGINEER']))).toBe(false);
  });

  it.each([['ADMIN'], ['MANAGER']])('%s 는 스코프를 걸지 않고 명부를 받는다', (role) => {
    expect(policies.clientSrScopeWhere(user([role]))).toEqual({});
    expect(policies.canViewClientRoster(user([role]))).toBe(true);
  });

  // 외부 사용자는 담당자 축을 걸지 않는다 — 고객사 경계는 canReadClient 가 이미 판정한다.
  // 명부(canViewClientRoster)는 여기서 단언하지 않는다. 지금은 자사 명부를 받지만, PRD 권한표는
  // CLIENT_USER 에게 고객사 조회 ❌·사용자 조회는 본인만으로 적고 있어 **정책 미결**이다. 결정 전에
  // 테스트로 현재 동작을 계약처럼 못박지 않는다.
  it.each([['CLIENT_ADMIN'], ['CLIENT_USER']])('%s 에게 SR 담당자 스코프를 걸지 않는다', (role) => {
    expect(policies.clientSrScopeWhere(user([role]))).toEqual({});
  });
});

/**
 * 실시간 이벤트 수신 자격(SSE 연결별). 내부 노트(D7)는 이벤트가 왔다는 사실만으로도 고객에게 존재가
 * 드러나므로 내부 사용자에게만 흘린다.
 */
describe('canReceiveRealtimeEvent', () => {
  const viewer = (roles: string[], id = 'viewer', clientIds: string[] = ['c1']) => ({
    id,
    email: 'v@example.com',
    name: null,
    image: null,
    roles,
    permissions: ['SR:READ'],
    clientIds,
  });
  const event = {
    srId: 'sr-1',
    clientId: 'c1',
    requesterId: 'req',
    assigneeId: 'eng',
    actorId: 'actor',
  };

  it('내부 전용 이벤트는 외부 사용자에게 흘리지 않는다', () => {
    expect(
      policies.canReceiveRealtimeEvent(viewer(['CLIENT_USER']), { ...event, internalOnly: true })
    ).toBe(false);
    expect(
      policies.canReceiveRealtimeEvent(viewer(['MANAGER']), { ...event, internalOnly: true })
    ).toBe(true);
  });

  it('대조군: 공개 이벤트는 같은 고객사 외부 사용자도 받는다', () => {
    expect(policies.canReceiveRealtimeEvent(viewer(['CLIENT_USER']), event)).toBe(true);
  });

  it('자기가 유발한 이벤트는 받지 않는다(에코 방지)', () => {
    expect(policies.canReceiveRealtimeEvent(viewer(['MANAGER'], 'actor'), event)).toBe(false);
  });

  it('다른 고객사 SR 의 이벤트는 받지 않는다(테넌트 격리)', () => {
    expect(policies.canReceiveRealtimeEvent(viewer(['CLIENT_USER'], 'viewer', ['c2']), event)).toBe(
      false
    );
  });
});

/**
 * 라우트가 역할 문자열을 직접 비교하던 판정을 옮긴 것(헌법 §1.2 — 인가 판정은 policies.ts 한 곳).
 * 동작은 옮기기 전과 같아야 한다.
 */
describe('라우트에서 옮겨 온 인가 판정', () => {
  const user = (roles: string[], permissions: string[] = [], clientIds: string[] = []) => ({
    id: 'u',
    email: 'u@example.com',
    name: null,
    image: null,
    roles,
    permissions,
    clientIds,
  });

  it('ADMIN 전용 기능은 ADMIN 만 통과한다(시스템 설정·알림 아웃박스·사용자 완전 삭제)', () => {
    expect(policies.isSystemAdmin(user(['ADMIN']))).toBe(true);
    for (const role of ['MANAGER', 'ENGINEER', 'CLIENT_ADMIN', 'CLIENT_USER']) {
      expect(policies.isSystemAdmin(user([role], ['SETTINGS:UPDATE']))).toBe(false);
    }
    expect(() => policies.ensureSystemAdmin(user(['MANAGER']), '관리자 전용')).toThrow(
      '관리자 전용'
    );
  });

  it('ADMIN 은 모든 권한을 암묵적으로 가진다 — 그 외에는 권한 플래그가 있어야 한다', () => {
    expect(policies.hasEffectivePermission(user(['ADMIN']), 'ANY:THING')).toBe(true);
    expect(policies.hasEffectivePermission(user(['MANAGER'], ['SR:READ']), 'SR:READ')).toBe(true);
    expect(policies.hasEffectivePermission(user(['MANAGER'], ['SR:READ']), 'SR:DELETE')).toBe(
      false
    );
  });

  it('역할 부여는 ADMIN 또는 ROLE:ASSIGN 만(D5 — MANAGER 는 역할만으로 통과하지 않는다)', () => {
    expect(() => policies.ensureCanAssignRoles(user(['ADMIN']))).not.toThrow();
    expect(() => policies.ensureCanAssignRoles(user(['CUSTOM'], ['ROLE:ASSIGN']))).not.toThrow();
    expect(() => policies.ensureCanAssignRoles(user(['MANAGER'], ['USER:UPDATE']))).toThrow(
      '역할을 할당할 권한이 없습니다.'
    );
  });

  it('고객사 소속 배정·해제는 운영 관리자(ADMIN·MANAGER)만', () => {
    expect(policies.canManageUserClientAssignment(user(['ADMIN']))).toBe(true);
    expect(policies.canManageUserClientAssignment(user(['MANAGER']))).toBe(true);
    expect(policies.canManageUserClientAssignment(user(['ENGINEER']))).toBe(false);
    expect(policies.canManageUserClientAssignment(user(['CLIENT_ADMIN'], [], ['c1']))).toBe(false);
  });

  it('가입 승인은 운영 관리자는 모든 고객사, CLIENT_ADMIN 은 자기 고객사만', () => {
    expect(policies.canApproveMembership(user(['MANAGER']), 'c9')).toBe(true);
    expect(policies.canApproveMembership(user(['CLIENT_ADMIN'], [], ['c1']), 'c1')).toBe(true);
    expect(policies.canApproveMembership(user(['CLIENT_ADMIN'], [], ['c1']), 'c9')).toBe(false);
    expect(policies.canApproveMembership(user(['CLIENT_USER'], [], ['c1']), 'c1')).toBe(false);
    expect(() => policies.ensureCanApproveMembership(user(['ENGINEER']), 'c1')).toThrow(
      '이 고객사 소속을 승인/거절할 권한이 없습니다.'
    );
  });

  it('CSV 내보내기는 내부 사용자만', () => {
    expect(policies.canExportSRs(user(['ENGINEER']))).toBe(true);
    expect(policies.canExportSRs(user(['CLIENT_ADMIN'], ['SR:READ'], ['c1']))).toBe(false);
  });
});
