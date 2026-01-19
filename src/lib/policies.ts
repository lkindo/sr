/**
 * Policy Functions - 함수 기반 권한 검증
 *
 * 클래스 기반 Policy를 함수로 간소화하여 단순하고 명확한 권한 검증 제공
 */

import { Client, Role, SR, User } from '@prisma/client';

import { ForbiddenError } from '@/lib/errors';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import { AuthenticatedUser } from '@/types/session';

// ============================================================================
// SR 권한 함수
// ============================================================================

export function canCreateSR(user: AuthenticatedUser): boolean {
  return hasPermissionFlag(user, PERMISSIONS.SR.CREATE);
}

export function canReadSR(user: AuthenticatedUser, sr: SR): boolean {
  const isAdmin = user.roles.includes('ADMIN');
  const canViewAll = hasPermissionFlag(user, PERMISSIONS.SR.READ);
  const belongsToClient = user.clientIds?.includes(sr.clientId) ?? false;
  const isRequester =
    sr.requesterId === user.id &&
    hasPermissionFlag(user, PERMISSIONS.SR.UPDATE_SELF) &&
    belongsToClient;

  return isAdmin || canViewAll || isRequester;
}

export function canUpdateSR(user: AuthenticatedUser, sr: SR): boolean {
  const isAdmin = user.roles.includes('ADMIN');
  const hasUpdate = hasPermissionFlag(user, PERMISSIONS.SR.UPDATE);
  const isRequester =
    sr.requesterId === user.id && hasPermissionFlag(user, PERMISSIONS.SR.UPDATE_SELF);

  return Boolean(isAdmin || hasUpdate || isRequester);
}

export function canDeleteSR(user: AuthenticatedUser): boolean {
  return hasPermissionFlag(user, PERMISSIONS.SR.DELETE);
}

export function ensureCanCreateSR(user: AuthenticatedUser): void {
  if (!canCreateSR(user)) {
    throw new ForbiddenError('SR 생성 권한이 없습니다.');
  }
}

export function ensureCanReadSR(user: AuthenticatedUser, sr: SR): void {
  if (!canReadSR(user, sr)) {
    throw new ForbiddenError('SR 조회 권한이 없습니다.');
  }
}

export function ensureCanUpdateSR(user: AuthenticatedUser, sr: SR): void {
  if (!canUpdateSR(user, sr)) {
    throw new ForbiddenError('SR 수정 권한이 없습니다.');
  }
}

export function ensureCanDeleteSR(user: AuthenticatedUser): void {
  if (!canDeleteSR(user)) {
    throw new ForbiddenError('SR 삭제 권한이 없습니다.');
  }
}

// ============================================================================
// Client 권한 함수
// ============================================================================

export function canCreateClient(user: AuthenticatedUser): boolean {
  return user.roles.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.CLIENT.CREATE);
}

export function canReadClient(user: AuthenticatedUser, client?: Client): boolean {
  const isAdmin = user.roles.includes('ADMIN');
  const canViewAll = hasPermissionFlag(user, PERMISSIONS.CLIENT.READ);

  if (client) {
    const isMemberOfClient = user.clientIds?.includes(client.id) ?? false;
    return isAdmin || canViewAll || isMemberOfClient;
  }

  return isAdmin || canViewAll;
}

export function canUpdateClient(user: AuthenticatedUser): boolean {
  return user.roles.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.CLIENT.UPDATE);
}

export function canDeleteClient(user: AuthenticatedUser): boolean {
  return user.roles.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.CLIENT.DELETE);
}

export function ensureCanCreateClient(user: AuthenticatedUser): void {
  if (!canCreateClient(user)) {
    throw new ForbiddenError('고객사 생성 권한이 없습니다.');
  }
}

export function ensureCanReadClient(user: AuthenticatedUser, client?: Client): void {
  if (!canReadClient(user, client)) {
    throw new ForbiddenError('고객사 조회 권한이 없습니다.');
  }
}

export function ensureCanUpdateClient(user: AuthenticatedUser): void {
  if (!canUpdateClient(user)) {
    throw new ForbiddenError('고객사 수정 권한이 없습니다.');
  }
}

export function ensureCanDeleteClient(user: AuthenticatedUser): void {
  if (!canDeleteClient(user)) {
    throw new ForbiddenError('고객사 삭제 권한이 없습니다.');
  }
}

// ============================================================================
// User 권한 함수
// ============================================================================

export function canCreateUser(user: AuthenticatedUser): boolean {
  return user.roles.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.USER.CREATE);
}

export function canReadUser(user: AuthenticatedUser, targetUser?: User): boolean {
  const isAdmin = user.roles.includes('ADMIN');
  const canViewAll = hasPermissionFlag(user, PERMISSIONS.USER.READ);

  if (targetUser) {
    const isSelf = targetUser.id === user.id;
    return isAdmin || canViewAll || isSelf;
  }

  return isAdmin || canViewAll;
}

export function canUpdateUser(user: AuthenticatedUser, targetUser: User): boolean {
  const isAdmin = user.roles.includes('ADMIN');
  const hasUpdate = hasPermissionFlag(user, PERMISSIONS.USER.UPDATE);
  const isSelf = targetUser.id === user.id && hasPermissionFlag(user, PERMISSIONS.USER.UPDATE_SELF);

  return isAdmin || hasUpdate || isSelf;
}

export function canDeleteUser(user: AuthenticatedUser, targetUser: User): boolean {
  const isAdmin = user.roles.includes('ADMIN');
  const hasDelete = hasPermissionFlag(user, PERMISSIONS.USER.DELETE);

  // 자기 자신은 삭제 불가
  if (targetUser.id === user.id) {
    return false;
  }

  return isAdmin || hasDelete;
}

export function ensureCanCreateUser(user: AuthenticatedUser): void {
  if (!canCreateUser(user)) {
    throw new ForbiddenError('사용자 생성 권한이 없습니다.');
  }
}

export function ensureCanReadUser(user: AuthenticatedUser, targetUser?: User): void {
  if (!canReadUser(user, targetUser)) {
    throw new ForbiddenError('사용자 조회 권한이 없습니다.');
  }
}

export function ensureCanUpdateUser(user: AuthenticatedUser, targetUser: User): void {
  if (!canUpdateUser(user, targetUser)) {
    throw new ForbiddenError('사용자 수정 권한이 없습니다.');
  }
}

export function ensureCanDeleteUser(user: AuthenticatedUser, targetUser: User): void {
  if (targetUser.id === user.id) {
    throw new ForbiddenError('자기 자신을 삭제할 수 없습니다.');
  }
  if (!canDeleteUser(user, targetUser)) {
    throw new ForbiddenError('사용자 삭제 권한이 없습니다.');
  }
}

// ============================================================================
// Role 권한 함수
// ============================================================================

const SYSTEM_ROLES = ['ADMIN', 'USER', 'GUEST'];

export function canCreateRole(user: AuthenticatedUser): boolean {
  return user.roles.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.ROLE.CREATE);
}

export function canReadRole(user: AuthenticatedUser): boolean {
  return user.roles.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.ROLE.READ);
}

export function canUpdateRole(user: AuthenticatedUser, role: Role): boolean {
  // ADMIN 역할은 수정 불가 (시스템 보호)
  if (role.name === 'ADMIN') {
    return false;
  }

  return user.roles.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.ROLE.UPDATE);
}

export function canDeleteRole(user: AuthenticatedUser, role: Role): boolean {
  // 시스템 역할은 삭제 불가
  if (SYSTEM_ROLES.includes(role.name)) {
    return false;
  }

  return user.roles.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.ROLE.DELETE);
}

export function canAssignRole(user: AuthenticatedUser, role: Role): boolean {
  const isAdmin = user.roles.includes('ADMIN');

  // ADMIN 역할 할당은 ADMIN만 가능
  if (role.name === 'ADMIN') {
    return isAdmin;
  }

  return isAdmin || hasPermissionFlag(user, PERMISSIONS.ROLE.ASSIGN);
}

export function ensureCanCreateRole(user: AuthenticatedUser): void {
  if (!canCreateRole(user)) {
    throw new ForbiddenError('역할 생성 권한이 없습니다.');
  }
}

export function ensureCanReadRole(user: AuthenticatedUser): void {
  if (!canReadRole(user)) {
    throw new ForbiddenError('역할 조회 권한이 없습니다.');
  }
}

export function ensureCanUpdateRole(user: AuthenticatedUser, role: Role): void {
  if (role.name === 'ADMIN') {
    throw new ForbiddenError('ADMIN 역할은 수정할 수 없습니다.');
  }
  if (!canUpdateRole(user, role)) {
    throw new ForbiddenError('역할 수정 권한이 없습니다.');
  }
}

export function ensureCanDeleteRole(user: AuthenticatedUser, role: Role): void {
  if (SYSTEM_ROLES.includes(role.name)) {
    throw new ForbiddenError('시스템 역할은 삭제할 수 없습니다.');
  }
  if (!canDeleteRole(user, role)) {
    throw new ForbiddenError('역할 삭제 권한이 없습니다.');
  }
}

export function ensureCanAssignRole(user: AuthenticatedUser, role: Role): void {
  if (role.name === 'ADMIN' && !user.roles.includes('ADMIN')) {
    throw new ForbiddenError('ADMIN 역할 할당은 ADMIN만 가능합니다.');
  }
  if (!canAssignRole(user, role)) {
    throw new ForbiddenError('역할 할당 권한이 없습니다.');
  }
}
