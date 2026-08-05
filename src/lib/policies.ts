/**
 * Policy Functions - 함수 기반 권한 검증
 *
 * 클래스 기반 Policy를 함수로 간소화하여 단순하고 명확한 권한 검증 제공
 */

import { Client, Role, SR, User } from '@prisma/client';

import { ForbiddenError } from '@/lib/errors';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import { AuthenticatedUser } from '@/types/session';

const INTERNAL_ROLES = ['ADMIN', 'MANAGER', 'ENGINEER'];

/**
 * 권한 검증에 필요한 SR 필드만 추린 형태.
 * 전체 SR 객체 대신 이 형태만 요구하여, 라우트에서 `as any` 캐스팅 없이
 * `select`로 필요한 필드만 조회해 정책 함수에 전달할 수 있게 한다.
 */
export type SRAccessFields = Pick<SR, 'id' | 'clientId' | 'requesterId' | 'assigneeId'>;

/** 권한 검증에 필요한 Client 식별 필드(id)만 추린 형태. */
export type ClientAccessFields = Pick<Client, 'id'>;

/**
 * 권한 검증에 필요한 User 식별 필드(id)와 테넌트 판정을 위한 소속 고객사 목록.
 * 소속 정보가 전달되지 않으면(undefined/null) 소속이 없는 것으로 간주하여
 * 외부 사용자에게는 테넌트 조건이 성립하지 않도록(차단) 처리한다.
 */
export type UserIdentity = Pick<User, 'id'> & {
  clients?: { clientId: string }[] | null;
};

export function isInternalUser(user: AuthenticatedUser): boolean {
  return user.roles?.some((role) => INTERNAL_ROLES.includes(role)) ?? false;
}

// ============================================================================
// SR 권한 함수
// ============================================================================

export function canCreateSR(user: AuthenticatedUser): boolean {
  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.SR.CREATE);
}

export function canReadSR(user: AuthenticatedUser, sr: SRAccessFields): boolean {
  const isAdmin = user.roles?.includes('ADMIN') ?? false;
  if (isAdmin) return true;

  const isManager = user.roles?.includes('MANAGER') ?? false;
  if (isManager && hasPermissionFlag(user, PERMISSIONS.SR.READ)) {
    return true;
  }

  // ENGINEER 역할 제약 조건 (비즈니스 헌법 제1조 1.1 및 1.2 격리 원칙 반영)
  const isEngineer = user.roles?.includes('ENGINEER') ?? false;
  if (isEngineer) {
    // 자신에게 명시적으로 배정/할당된 SR에 한해서만 조회 허용
    return sr.assigneeId === user.id && hasPermissionFlag(user, PERMISSIONS.SR.READ);
  }

  const hasReadPermission = hasPermissionFlag(user, PERMISSIONS.SR.READ);

  // 외부 사용자(고객사)는 소속된 고객사의 SR만 조회 가능
  const belongsToClient = user.clientIds?.includes(sr.clientId) ?? false;

  if (hasReadPermission && belongsToClient) {
    return true;
  }

  // 요청자 본인인 경우 (권한이 없더라도 본인이 생성한 것은 볼 수 있는지? 보통은 READ 권한 필요하지만 legacy logic 유지)
  const isRequester =
    sr.requesterId === user.id &&
    hasPermissionFlag(user, PERMISSIONS.SR.UPDATE_SELF) &&
    belongsToClient;

  return isRequester;
}

export function canUpdateSR(user: AuthenticatedUser, sr: SRAccessFields): boolean {
  const isAdmin = user.roles?.includes('ADMIN') ?? false;
  if (isAdmin) return true;

  const isManager = user.roles?.includes('MANAGER') ?? false;
  if (isManager && hasPermissionFlag(user, PERMISSIONS.SR.UPDATE)) {
    return true;
  }

  // ENGINEER 역할 제약 조건 (비즈니스 헌법 제1조 1.1 및 1.2 격리 원칙 반영)
  const isEngineer = user.roles?.includes('ENGINEER') ?? false;
  if (isEngineer) {
    // 자신에게 명시적으로 배정/할당된 SR에 한해서만 수정 허용
    return sr.assigneeId === user.id && hasPermissionFlag(user, PERMISSIONS.SR.UPDATE);
  }

  const hasUpdate = hasPermissionFlag(user, PERMISSIONS.SR.UPDATE);

  // 외부 사용자(고객사)는 소속된 고객사의 SR만 수정 가능
  const belongsToClient = user.clientIds?.includes(sr.clientId) ?? false;
  if (hasUpdate && belongsToClient) {
    return true;
  }

  const isRequester =
    sr.requesterId === user.id &&
    hasPermissionFlag(user, PERMISSIONS.SR.UPDATE_SELF) &&
    belongsToClient;

  return isRequester;
}

/**
 * SR 삭제 권한.
 *
 * 예전에는 `sr` 인자 자체가 없어 `ADMIN || SR:DELETE` 만 봤다(감사 4.1). 그래서
 * `SR:DELETE` 를 가진 외부 사용자가 **테넌트를 가리지 않고** 아무 SR 이나 지울 수
 * 있었다. 삭제는 되돌릴 수 없으므로 조회·수정보다 느슨하면 안 된다.
 */
export function canDeleteSR(user: AuthenticatedUser, sr: SRAccessFields): boolean {
  const isAdmin = user.roles?.includes('ADMIN') ?? false;
  if (isAdmin) return true;

  if (!hasPermissionFlag(user, PERMISSIONS.SR.DELETE)) {
    return false;
  }

  // 내부 사용자(MANAGER/ENGINEER)는 권한 보유만으로 통과한다.
  // 외부 사용자는 자기 테넌트의 SR 로 제한한다.
  return isInternalUser(user) || (user.clientIds?.includes(sr.clientId) ?? false);
}

/**
 * 종결된 SR. 이 상태의 레코드는 감사 추적 대상이므로 첨부를 붙일 수 없다.
 */
const CLOSED_SR_STATUSES: ReadonlySet<string> = new Set(['COMPLETED', 'CONFIRMED', 'REJECTED']);

/**
 * 첨부 업로드 권한.
 *
 * 예전에는 두 업로드 경로가 `ensureCanReadSR` 로 게이트됐다(감사 4.1). 읽기 권한만
 * 가진 사용자가 파일을 **쓸 수** 있었고, `sr.status` 를 보지 않아 이미 완료·확정·반려된
 * SR 에도 첨부가 붙었다. 반면 삭제는 `ensureCanUpdateSR` 을 요구해서, 자기가 올린 것을
 * 자기가 지우지 못하는 비대칭까지 있었다.
 *
 * 업로드는 쓰기다. 수정 권한으로 게이트하고 종결 상태를 막는다.
 */
export function ensureCanAttachToSR(
  user: AuthenticatedUser,
  sr: SRAccessFields & { status: string }
): void {
  ensureCanUpdateSR(user, sr);

  if (CLOSED_SR_STATUSES.has(sr.status)) {
    throw new ForbiddenError(
      '종결된 SR(완료/확정/반려)에는 첨부파일을 추가할 수 없습니다. 필요하면 SR을 다시 열어주세요.'
    );
  }
}

export function ensureCanCreateSR(user: AuthenticatedUser): void {
  if (!canCreateSR(user)) {
    throw new ForbiddenError('SR 생성 권한이 없습니다.');
  }
}

export function ensureCanReadSR(user: AuthenticatedUser, sr: SRAccessFields): void {
  if (!canReadSR(user, sr)) {
    throw new ForbiddenError('SR 조회 권한이 없습니다.');
  }
}

export function ensureCanUpdateSR(user: AuthenticatedUser, sr: SRAccessFields): void {
  if (!canUpdateSR(user, sr)) {
    throw new ForbiddenError('SR 수정 권한이 없습니다.');
  }
}

export function ensureCanDeleteSR(user: AuthenticatedUser, sr: SRAccessFields): void {
  if (!canDeleteSR(user, sr)) {
    throw new ForbiddenError('SR 삭제 권한이 없습니다.');
  }
}

// ============================================================================
// Client 권한 함수
// ============================================================================

export function canCreateClient(user: AuthenticatedUser): boolean {
  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.CLIENT.CREATE);
}

export function canReadClient(user: AuthenticatedUser, client?: ClientAccessFields): boolean {
  const isAdmin = user.roles?.includes('ADMIN') ?? false;
  const canViewAll = hasPermissionFlag(user, PERMISSIONS.CLIENT.READ);

  if (client) {
    // 테넌트 격리: 권한 플래그(CLIENT:READ)만으로는 타 고객사 상세를 볼 수 없다.
    // 외부 사용자(고객사)는 반드시 해당 고객사에 소속되어 있어야 한다.
    const isMemberOfClient = user.clientIds?.includes(client.id) ?? false;
    return isAdmin || (canViewAll && isInternalUser(user)) || isMemberOfClient;
  }

  // 목록 조회는 라우트에서 clientIds 로 스코프되므로 플래그만으로 통과시킨다.
  return isAdmin || canViewAll;
}

export function canUpdateClient(user: AuthenticatedUser): boolean {
  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.CLIENT.UPDATE);
}

export function canDeleteClient(user: AuthenticatedUser): boolean {
  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.CLIENT.DELETE);
}

/**
 * 고객사 쓰기(수정/삭제)의 테넌트 경계.
 *
 * `canUpdateClient`/`canDeleteClient` 는 권한 플래그만 본다. REST 라우트의 PATCH 는
 * 그 위에 소속 검사를 **직접** 얹어 두었지만, DELETE 와 서버 액션
 * (`updateClientAction`/`deleteClientAction`)에는 그 검사가 없었다(감사 4.1).
 * 같은 규칙이 세 곳에 흩어져 하나만 빠진 전형적인 형태라, 술어를 여기로 올린다.
 *
 * 외부 사용자는 자기가 소속된 고객사만 건드릴 수 있다.
 */
export function ensureCanWriteClient(user: AuthenticatedUser, clientId: string): void {
  if (isInternalUser(user)) {
    return;
  }
  if (!(user.clientIds ?? []).includes(clientId)) {
    throw new ForbiddenError('해당 고객사에 대한 권한이 없습니다.');
  }
}

export function ensureCanCreateClient(user: AuthenticatedUser): void {
  if (!canCreateClient(user)) {
    throw new ForbiddenError('고객사 생성 권한이 없습니다.');
  }
}

export function ensureCanReadClient(user: AuthenticatedUser, client?: ClientAccessFields): void {
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

  return isAdmin || hasDelete;
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
  if (!canDeleteUser(user, targetUser)) {
    throw new ForbiddenError('사용자 삭제 권한이 없습니다.');
  }
}

// ============================================================================
// Role 권한 함수
// ============================================================================

const SYSTEM_ROLES = ['ADMIN', 'USER', 'GUEST'];

export function canCreateRole(user: AuthenticatedUser): boolean {
  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.ROLE.CREATE);
}

export function canReadRole(user: AuthenticatedUser): boolean {
  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.ROLE.READ);
}

export function canUpdateRole(user: AuthenticatedUser, role: Role): boolean {
  // ADMIN 역할은 수정 불가 (시스템 보호)
  if (role.name === 'ADMIN') {
    return false;
  }

  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.ROLE.UPDATE);
}

export function canDeleteRole(user: AuthenticatedUser, role: Role): boolean {
  // 시스템 역할은 삭제 불가
  if (SYSTEM_ROLES.includes(role.name)) {
    return false;
  }

  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.ROLE.DELETE);
}

export function canAssignRole(user: AuthenticatedUser, role: Role): boolean {
  const isAdmin = user.roles?.includes('ADMIN') ?? false;

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

/**
 * 역할 이름 변경이 시스템 역할을 사칭하지 못하게 한다.
 *
 * `ensureCanUpdateRole` 은 **대상 역할이 ADMIN 인지**만 봤다. 그래서 ROLE:UPDATE 보유자가
 * 평범한 커스텀 역할의 이름을 'ADMIN' 으로 바꾸면, 코드베이스 전역의
 * `roles.includes('ADMIN')` 검사가 전부 통과한다(감사 3.11).
 */
export function ensureRoleNameNotReserved(user: AuthenticatedUser, nextName?: string): void {
  if (!nextName) return;
  const isAdmin = user.roles?.includes('ADMIN') ?? false;
  if (isAdmin) return;

  if (SYSTEM_ROLES.some((name) => name.toLowerCase() === nextName.trim().toLowerCase())) {
    throw new ForbiddenError(`시스템 역할 이름(${nextName})으로 변경할 수 없습니다.`);
  }
}

/**
 * 행위자가 **자기 자신의 역할**을 대상으로 삼는 것을 막는다.
 *
 * 막지 않으면 ROLE:UPDATE 보유자가 자기 역할에 모든 권한을 얹어 즉시 풀 어드민이 된다.
 * ADMIN 은 이미 전권이므로 예외다 — 막아도 얻는 보호가 없고 운영만 불편해진다.
 */
export function ensureNotActorsOwnRole(user: AuthenticatedUser, role: Role): void {
  if (user.roles?.includes('ADMIN')) return;

  if (user.roles?.includes(role.name)) {
    throw new ForbiddenError(
      '자신이 보유한 역할은 수정할 수 없습니다. 다른 관리자에게 요청하세요.'
    );
  }
}

/**
 * 행위자가 **보유하지 않은 권한을 부여하는 것**을 막는다(권한 상승 방지).
 *
 * 이것이 없으면 `ROLE:UPDATE` 하나로 `USER:DELETE`·`SR:DELETE`·`ROLE:ASSIGN` 을 만들어
 * 낼 수 있다. 즉 권한 하나가 모든 권한과 등가가 된다.
 *
 * ADMIN 은 예외다. 그리고 **회수는 막지 않는다** — 자기가 못 가진 권한을 빼는 것은
 * 상승이 아니라 축소이므로 허용해야 운영이 가능하다.
 *
 * @param granted 행위자가 이미 보유한 권한 문자열(`RESOURCE:ACTION`)
 * @param nextPermissions 이번에 부여하려는 권한 문자열
 * @param currentPermissions 대상 역할이 지금 보유한 권한 문자열
 */
export function ensureNoPrivilegeEscalation(
  user: AuthenticatedUser,
  nextPermissions: string[],
  currentPermissions: string[]
): void {
  if (user.roles?.includes('ADMIN')) return;

  const held = new Set((user.permissions ?? []).map((entry) => entry.toUpperCase()));
  const already = new Set(currentPermissions.map((entry) => entry.toUpperCase()));

  const escalating = nextPermissions
    .map((entry) => entry.toUpperCase())
    // 이미 대상 역할이 갖고 있던 권한은 이번 요청이 새로 만든 것이 아니다.
    .filter((entry) => !already.has(entry))
    .filter((entry) => !held.has(entry));

  if (escalating.length > 0) {
    throw new ForbiddenError(
      `본인이 보유하지 않은 권한은 부여할 수 없습니다: ${escalating.join(', ')}`
    );
  }
}

export function ensureCanAssignRole(user: AuthenticatedUser, role: Role): void {
  if (role.name === 'ADMIN' && !user.roles?.includes('ADMIN')) {
    throw new ForbiddenError('ADMIN 역할 할당은 ADMIN만 가능합니다.');
  }
  if (!canAssignRole(user, role)) {
    throw new ForbiddenError('역할 할당 권한이 없습니다.');
  }
}
