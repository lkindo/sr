/**
 * 역할 권한: 생성·수정·삭제, 예약 이름, 권한 상승 방지, 담당자 범위
 */

import { Role } from '@prisma/client';

import { BusinessRuleError, ForbiddenError } from '@/lib/errors';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import { isCanonicalRole, isImmutableRole, isReservedRoleName } from '@/lib/role-rules';
import { AuthenticatedUser } from '@/types/session';

import { hasEffectivePermission, INTERNAL_ROLES } from './core';

export function canCreateRole(user: AuthenticatedUser): boolean {
  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.ROLE.CREATE);
}

export function canReadRole(user: AuthenticatedUser): boolean {
  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.ROLE.READ);
}

export function canUpdateRole(user: AuthenticatedUser, role: Role): boolean {
  // ADMIN 역할은 수정 불가 (시스템 보호)
  if (isImmutableRole(role.name)) {
    return false;
  }

  return user.roles?.includes('ADMIN') || hasPermissionFlag(user, PERMISSIONS.ROLE.UPDATE);
}

export function canDeleteRole(user: AuthenticatedUser, role: Role): boolean {
  // 기본 역할은 삭제 불가 — 이름이 곧 인가의 열쇠다(헌법 §1.4, role-rules.ts)
  if (isCanonicalRole(role.name)) {
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
  if (isImmutableRole(role.name)) {
    throw new ForbiddenError('ADMIN 역할은 수정할 수 없습니다.');
  }
  if (!canUpdateRole(user, role)) {
    throw new ForbiddenError('역할 수정 권한이 없습니다.');
  }
}

export function ensureCanDeleteRole(user: AuthenticatedUser, role: Role): void {
  if (isCanonicalRole(role.name)) {
    throw new ForbiddenError('기본 역할은 삭제할 수 없습니다.');
  }
  if (!canDeleteRole(user, role)) {
    throw new ForbiddenError('역할 삭제 권한이 없습니다.');
  }
}

/**
 * 역할 이름이 기본 역할과 부딪히지 않게 한다 — 생성과 개명 모두(헌법 §1.4).
 *
 *  - 기본 역할 자신은 이름을 바꿀 수 없다. 세션·정책·메뉴·알림이 이름으로 판정하므로 개명은 표시 변경이
 *    아니라 그 역할 사용자 전원의 인가 해제다. 부팅 시드는 이름으로 역할을 찾으므로 빈 기본 역할을 또 만든다.
 *  - 다른 역할은 기본 역할 이름(대소문자 무시)을 가질 수 없다. 예전에는 ROLE:UPDATE 보유자가 커스텀 역할을
 *    'ADMIN' 으로 바꾸면 전역 `roles.includes('ADMIN')` 이 통과했다(감사 3.11). 'MANAGER'·'ENGINEER' 도
 *    같다 — 그 역할 사용자가 내부 사용자로 판정돼 전 고객사 SR 이 열린다. 그래서 ADMIN 도 예외가 아니다.
 *
 * 수정 폼은 이름을 고치지 않아도 늘 보내므로, 지금 이름과 같으면 검사하지 않는다(설명만 고치는 경우).
 */
export function ensureRoleNameAllowed(
  nextName: string | undefined,
  current?: Pick<Role, 'name'>
): void {
  if (nextName === undefined) return;
  if (current && nextName === current.name) return;

  if (current && isCanonicalRole(current.name)) {
    throw new ForbiddenError(`기본 역할(${current.name})의 이름은 바꿀 수 없습니다.`);
  }
  if (isReservedRoleName(nextName)) {
    throw new ForbiddenError(`기본 역할 이름(${nextName.trim()})은 쓸 수 없습니다.`);
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

/**
 * 목록 조회에 걸어야 하는 **담당자 스코프**.
 *
 * `canReadSR` 은 ENGINEER 에게 `sr.assigneeId === user.id` 만 허용한다
 * ("비즈니스 헌법 제1조 격리 원칙"). 그런데 목록 경로는 `resolveClientIdFilter` 만 거쳤고,
 * 그 함수는 내부 사용자를 그대로 통과시킨다. 그 결과 **목록과 상세가 어긋났다**:
 *   GET /api/srs        → 200, 미배정 SR 까지 제목·고객사가 보인다
 *   GET /api/srs/{그 id} → 403
 * 목록에서 보이는 행을 클릭하면 접근 거부가 되는 구조였고, 그 자체가 정보 노출이다
 * (제목과 고객사명이 새어 나간다).
 *
 * 규칙이 두 곳에 있으면 갈라진다 — 그래서 canReadSR 과 **같은 우선순위**를 여기 한 번 더
 * 적지 않고, 같은 판정 순서를 그대로 따른다: ADMIN → MANAGER(+SR:READ) → ENGINEER.
 * 외부 사용자는 clientId 스코프가 이미 처리하므로 여기서는 아무것도 하지 않는다.
 */
export function resolveAssigneeScope(user: AuthenticatedUser): string | undefined {
  if (user.roles?.includes('ADMIN')) return undefined;

  const isManager = user.roles?.includes('MANAGER') ?? false;
  if (isManager && hasPermissionFlag(user, PERMISSIONS.SR.READ)) return undefined;

  if (user.roles?.includes('ENGINEER')) return user.id;

  return undefined;
}

/**
 * 사용자에게 역할을 직접 부여할 수 있는가 — ADMIN 또는 ROLE:ASSIGN(소유자 결정 2026-09-18 D5: 기본은 ADMIN
 * 전용이고, ROLE:ASSIGN 은 ADMIN 이 커스텀 역할에 위임할 때만 쓴다). 대상·부여 범위(자기 자신·ADMIN 역할·
 * 보유하지 않은 권한)는 ensureCanAssignRolesToUser 가 따로 판정한다.
 */
export function ensureCanAssignRoles(user: AuthenticatedUser): void {
  if (!hasEffectivePermission(user, PERMISSIONS.ROLE.ASSIGN)) {
    throw new ForbiddenError('역할을 할당할 권한이 없습니다.');
  }
}

/**
 * 고객사에 종속된 역할. 시스템 운영 역할(`INTERNAL_ROLES`)과 상호 배타적이다.
 * 모듈 내부 전용 — 판정은 `ensureRoleClientExclusivity` 를 거치게 해서
 * 호출부가 역할명 배열을 다시 복제하지 않게 한다.
 */
const CLIENT_ROLES = ['CLIENT_ADMIN', 'CLIENT_USER'];

/**
 * 헌법 §1.3 역할 상호 배타성 판정 — **단일 술어**.
 *
 * 두 가지를 함께 본다.
 *   1. 시스템 운영 역할과 고객사 역할을 한 사용자에게 동시에 부여할 수 없다.
 *   2. 시스템 운영 역할 보유자에게 고객사를 할당할 수 없고, 그 역도 성립한다
 *      (고객사에 소속된 사용자는 시스템 역할을 받을 수 없다).
 *
 * 이 규칙은 원래 **역할 교체 경로와 사용자 수정 경로에 각자 다른 사본**으로 있었고,
 * 정작 **사용자 생성 경로에는 없었다**(감사 D-12). 그래서 ADMIN 이 생성 다이얼로그에서
 * ENGINEER + 고객사 2곳을 고르면 헌법이 금지한 조합이 그대로 저장됐다.
 * 사본이 셋이면 하나는 반드시 뒤처진다 — 판정을 여기 한 곳에 둔다.
 *
 * @throws {BusinessRuleError} 배타성을 어기는 조합일 때
 */
export function ensureRoleClientExclusivity(roleNames: string[], clientIds: string[]): void {
  const systemRoles = roleNames.filter((name) => INTERNAL_ROLES.includes(name));
  const clientRoles = roleNames.filter((name) => CLIENT_ROLES.includes(name));

  if (systemRoles.length > 0 && clientRoles.length > 0) {
    throw new BusinessRuleError(
      `시스템 운영팀 역할(${systemRoles.join(', ')})과 고객사 역할(${clientRoles.join(', ')})은 ` +
        `한 사용자에게 동시에 부여할 수 없습니다. 하나의 역할 그룹만 선택하세요.`
    );
  }

  if (systemRoles.length > 0 && clientIds.length > 0) {
    throw new BusinessRuleError(
      `시스템 운영팀 역할(${systemRoles.join(', ')}) 보유자에게는 고객사를 할당할 수 없습니다.`
    );
  }

  if (clientRoles.length > 0 && clientIds.length === 0) {
    throw new BusinessRuleError(
      `고객사 역할(${clientRoles.join(', ')})은 소속 고객사가 지정되어야 부여할 수 있습니다.`
    );
  }
}
