/**
 * 사용자 권한: 조회·수정·삭제, 민감 필드, 역할 부여 범위, 가입 승인
 */

import { ForbiddenError } from '@/lib/errors';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import { DELETION_PROTECTED_ACCOUNT_MESSAGE, isDeletionProtectedAccount } from '@/lib/role-rules';
import { AuthenticatedUser } from '@/types/session';

import { INTERNAL_ROLES, isInternalUser, type RoleGrantFields, type UserIdentity } from './core';

/** 대상 사용자가 소속된 고객사 ID 목록. 소속 정보가 없으면 빈 배열. */
function getTargetClientIds(targetUser: UserIdentity): string[] {
  return targetUser.clients?.map((membership) => membership.clientId) ?? [];
}

/** 액터와 대상이 고객사를 하나 이상 공유하는지 여부. */
function sharesClientWith(user: AuthenticatedUser, targetUser: UserIdentity): boolean {
  const actorClientIds = user.clientIds ?? [];
  return getTargetClientIds(targetUser).some((clientId) => actorClientIds.includes(clientId));
}

/**
 * 대상의 소속 고객사가 액터의 소속 고객사에 모두 포함되는지 여부.
 * 어느 한쪽이라도 소속이 비어 있으면(= 테넌트를 특정할 수 없으면) 차단한다.
 */
function isTargetWithinActorClients(user: AuthenticatedUser, targetUser: UserIdentity): boolean {
  const actorClientIds = user.clientIds ?? [];
  const targetClientIds = getTargetClientIds(targetUser);

  if (actorClientIds.length === 0 || targetClientIds.length === 0) {
    return false;
  }

  return targetClientIds.every((clientId) => actorClientIds.includes(clientId));
}

function targetHasRole(targetUser: UserIdentity, roleName: string): boolean {
  return (targetUser.roles ?? []).some((entry) => entry.role.name === roleName);
}

function targetRoleNames(targetUser: UserIdentity): string[] {
  return (targetUser.roles ?? []).map((entry) => entry.role.name);
}

export function canCreateUser(user: AuthenticatedUser): boolean {
  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.USER.CREATE);
}

export function canReadUser(user: AuthenticatedUser, targetUser?: UserIdentity): boolean {
  const isAdmin = user.roles?.includes('ADMIN') ?? false;
  const canViewAll = hasPermissionFlag(user, PERMISSIONS.USER.READ);

  if (targetUser) {
    const isSelf = targetUser.id === user.id;
    if (isAdmin || isSelf) {
      return true;
    }
    if (!canViewAll) {
      return false;
    }

    // 테넌트 격리: 권한 플래그(USER:READ)만으로는 타 고객사 사용자를 볼 수 없다.
    // 외부 사용자(고객사)는 소속 고객사를 공유하는 사용자만 조회 가능하다.
    return isInternalUser(user) || sharesClientWith(user, targetUser);
  }

  return isAdmin || canViewAll;
}

export function canUpdateUser(user: AuthenticatedUser, targetUser: UserIdentity): boolean {
  const isAdmin = user.roles?.includes('ADMIN') ?? false;
  if (isAdmin) {
    return true;
  }

  // ADMIN 계정은 이름·활성 상태·이메일·비밀번호를 포함해 ADMIN만 관리한다.
  // 일반 USER:UPDATE 권한이 시스템 최고 권한 계정을 장악하는 통로가 되어서는 안 된다.
  if (targetHasRole(targetUser, 'ADMIN')) {
    return false;
  }

  const isSelf = targetUser.id === user.id && hasPermissionFlag(user, PERMISSIONS.USER.UPDATE_SELF);
  if (isSelf) {
    return true;
  }

  const hasUpdate = hasPermissionFlag(user, PERMISSIONS.USER.UPDATE);
  if (!hasUpdate) {
    return false;
  }

  // 테넌트 격리: 권한 플래그(USER:UPDATE)만으로는 타 고객사 사용자를 수정할 수 없다.
  // 외부 사용자(고객사)는 대상의 소속 고객사가 자신의 소속 고객사에 모두 포함될 때만 수정 가능하다.
  return isInternalUser(user) || isTargetWithinActorClients(user, targetUser);
}

export function canDeleteUser(user: AuthenticatedUser, targetUser: UserIdentity): boolean {
  const isAdmin = user.roles?.includes('ADMIN') ?? false;
  const hasDelete = hasPermissionFlag(user, PERMISSIONS.USER.DELETE);

  // 자기 자신은 삭제 불가
  if (targetUser.id === user.id) {
    return false;
  }

  // 운영 계정(ADMIN·MANAGER)은 삭제 경로로 다루지 않는다 — 역할 변경이나 활성 토글로 한다(결정 D11).
  if (isDeletionProtectedAccount(targetRoleNames(targetUser))) return false;

  if (isAdmin) return true;
  if (targetHasRole(targetUser, 'ADMIN') || !hasDelete) return false;

  // 내부 운영자는 전역 스코프, 외부 사용자는 자신의 테넌트 안에서만 삭제할 수 있다.
  return isInternalUser(user) || isTargetWithinActorClients(user, targetUser);
}

/**
 * 관리자 재설정 라우트에서 email/isActive/password/clientIds 같은 민감 필드를 바꿀 수 있는가.
 * 본인 변경은 현재 비밀번호를 확인하는 전용 프로필 경로를 사용해야 한다.
 */
export function canManageSensitiveUserFields(
  user: AuthenticatedUser,
  targetUser: UserIdentity
): boolean {
  if (user.id === targetUser.id) return false;
  if (targetHasRole(targetUser, 'ADMIN') && !user.roles?.includes('ADMIN')) return false;
  return (
    canUpdateUser(user, targetUser) &&
    (user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.USER.UPDATE))
  );
}

function grantedPermissionSet(roles: RoleGrantFields[]): Set<string> {
  return new Set(
    roles.flatMap((role) =>
      (role.permissions ?? []).map(({ permission }) =>
        `${permission.resource}:${permission.action}`.toUpperCase()
      )
    )
  );
}

function canGrantRoles(user: AuthenticatedUser, roles: RoleGrantFields[]): boolean {
  if (user.roles?.includes('ADMIN')) return true;
  if (!hasPermissionFlag(user, PERMISSIONS.ROLE.ASSIGN)) return false;
  if (roles.some((role) => role.name === 'ADMIN')) return false;
  if (!isInternalUser(user) && roles.some((role) => INTERNAL_ROLES.includes(role.name))) {
    return false;
  }

  const held = new Set((user.permissions ?? []).map((permission) => permission.toUpperCase()));
  return Array.from(grantedPermissionSet(roles)).every((permission) => held.has(permission));
}

export function ensureCanGrantRoles(user: AuthenticatedUser, roles: RoleGrantFields[]): void {
  if (user.roles?.includes('ADMIN')) return;
  if (!hasPermissionFlag(user, PERMISSIONS.ROLE.ASSIGN)) {
    throw new ForbiddenError('역할을 직접 할당할 권한이 없습니다.');
  }
  if (roles.some((role) => role.name === 'ADMIN')) {
    throw new ForbiddenError('ADMIN 역할은 ADMIN만 할당할 수 있습니다.');
  }
  if (!canGrantRoles(user, roles)) {
    throw new ForbiddenError('본인이 보유하지 않은 역할·권한은 부여할 수 없습니다.');
  }
}

/** 역할 교체 시 자기상승·상위 권한 부여·테넌트 경계 이탈을 한 곳에서 차단한다. */
export function canAssignRolesToUser(
  user: AuthenticatedUser,
  targetUser: UserIdentity,
  roles: RoleGrantFields[]
): boolean {
  if (user.roles?.includes('ADMIN')) return true;
  if (!canGrantRoles(user, roles)) return false;
  if (user.id === targetUser.id) return false;
  if (targetHasRole(targetUser, 'ADMIN')) return false;
  if (!canUpdateUser(user, targetUser)) return false;
  return true;
}

export function ensureCanAssignRolesToUser(
  user: AuthenticatedUser,
  targetUser: UserIdentity,
  roles: RoleGrantFields[]
): void {
  if (!canAssignRolesToUser(user, targetUser, roles)) {
    throw new ForbiddenError(
      '자신 또는 관리 범위 밖의 사용자에게 보유하지 않은 역할·권한을 부여할 수 없습니다.'
    );
  }
}

/** 사용자 생성/소속 변경 시 외부 행위자의 고객사 범위를 강제한다. */
export function ensureClientAssignmentsWithinScope(
  user: AuthenticatedUser,
  clientIds: string[]
): void {
  if (isInternalUser(user)) return;
  const actorClientIds = new Set(user.clientIds ?? []);
  if (clientIds.some((clientId) => !actorClientIds.has(clientId))) {
    throw new ForbiddenError('소속되지 않은 고객사에는 사용자를 생성하거나 배정할 수 없습니다.');
  }
}

export function ensureCanCreateUser(user: AuthenticatedUser): void {
  if (!canCreateUser(user)) {
    throw new ForbiddenError('사용자 생성 권한이 없습니다.');
  }
}

export function ensureCanReadUser(user: AuthenticatedUser, targetUser?: UserIdentity): void {
  if (!canReadUser(user, targetUser)) {
    throw new ForbiddenError('사용자 조회 권한이 없습니다.');
  }
}

export function ensureCanUpdateUser(user: AuthenticatedUser, targetUser: UserIdentity): void {
  if (!canUpdateUser(user, targetUser)) {
    throw new ForbiddenError('사용자 수정 권한이 없습니다.');
  }
}

export function ensureCanDeleteUser(user: AuthenticatedUser, targetUser: UserIdentity): void {
  if (targetUser.id === user.id) {
    throw new ForbiddenError('자기 자신을 삭제할 수 없습니다.');
  }
  if (isDeletionProtectedAccount(targetRoleNames(targetUser))) {
    throw new ForbiddenError(DELETION_PROTECTED_ACCOUNT_MESSAGE);
  }
  if (!canDeleteUser(user, targetUser)) {
    throw new ForbiddenError('사용자 삭제 권한이 없습니다.');
  }
}

/** 사용자의 고객사 소속을 배정·변경·해제할 수 있는가 — 운영 관리자(ADMIN·MANAGER). */
export function canManageUserClientAssignment(user: AuthenticatedUser): boolean {
  return user.roles?.some((role) => role === 'ADMIN' || role === 'MANAGER') ?? false;
}

/**
 * 고객사 소속 가입 신청을 승인·거절할 수 있는가.
 * - 운영 관리자(ADMIN·MANAGER): 모든 고객사
 * - 그 고객사의 CLIENT_ADMIN: 자기가 **승인된** 소속을 가진 고객사만(세션 clientIds 는 승인된 소속만 담는다)
 */
export function canApproveMembership(user: AuthenticatedUser, clientId: string): boolean {
  if (canManageUserClientAssignment(user)) return true;
  return (
    (user.roles?.includes('CLIENT_ADMIN') ?? false) && (user.clientIds ?? []).includes(clientId)
  );
}

export function ensureCanApproveMembership(user: AuthenticatedUser, clientId: string): void {
  if (!canApproveMembership(user, clientId)) {
    throw new ForbiddenError('이 고객사 소속을 승인/거절할 권한이 없습니다.');
  }
}
