/**
 * 기본 역할(시드가 만드는 다섯 역할)의 보호 규칙 — 서버 정책(`policies.ts`)과 /roles 화면이 함께 쓴다.
 *
 * 세션에는 역할 **이름**만 실리고 인가·메뉴·알림·가입이 그 이름을 문자열로 비교한다. 그래서 기본 역할의
 * 이름을 바꾸면 그 역할 사용자 전원이 권한을 잃고, 비워진 이름을 다른 역할이 차지하면 그 사용자가 내부
 * 사용자로 판정돼 고객사 격리가 풀린다. 기본 역할은 누구도(ADMIN 포함) 이름을 바꾸거나 지울 수 없고,
 * 다른 역할이 그 이름을 쓸 수도 없다. 설명과 권한 구성은 ADMIN 이 조정하는 기본값이다
 * (헌법 §1.4, 2026-09-18 소유자 결정 RB-12).
 */

export const CANONICAL_ROLE_NAMES = [
  'ADMIN',
  'MANAGER',
  'ENGINEER',
  'CLIENT_ADMIN',
  'CLIENT_USER',
] as const;

/** 기본 역할 자신인가 — 저장된 이름 그대로 비교한다. */
export function isCanonicalRole(name: string): boolean {
  return (CANONICAL_ROLE_NAMES as readonly string[]).includes(name);
}

/** 이 이름이 기본 역할 이름과 겹치는가 — 대소문자·앞뒤 공백을 무시한다(새 이름 검사용). */
export function isReservedRoleName(name: string): boolean {
  const normalized = name.trim().toUpperCase();
  return CANONICAL_ROLE_NAMES.some((reserved) => reserved === normalized);
}

/**
 * 삭제 경로(DELETE /api/users/[id] — 비활성화·영구 삭제)로 다룰 수 없는 운영 계정의 역할.
 * 이 역할을 가진 계정은 역할을 바꾸거나 활성 토글로 비활성화한다(2026-09-18 소유자 결정 D11). 예전에는 이 규칙이
 * 화면에만 있어 ADMIN 이 API 를 직접 부르면 다른 ADMIN·MANAGER 계정을 영구 삭제할 수 있었다.
 */
const DELETION_PROTECTED_ROLES: readonly string[] = ['ADMIN', 'MANAGER'];

export function isDeletionProtectedAccount(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => DELETION_PROTECTED_ROLES.includes(name));
}

/** 운영 계정 삭제를 막을 때의 안내. 서버(policies.ensureCanDeleteUser)와 화면(UserActions·사용자 상세)이 함께 쓴다. */
export const DELETION_PROTECTED_ACCOUNT_MESSAGE =
  '시스템 관리자 계정은 삭제할 수 없습니다. 역할을 변경하거나 비활성화하세요.';

/** 설명·권한까지 아무것도 바꿀 수 없는 역할. ADMIN 은 전권이라 줄이거나 늘릴 대상이 아니다. */
export function isImmutableRole(name: string): boolean {
  return name === 'ADMIN';
}
