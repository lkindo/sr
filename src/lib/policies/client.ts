/**
 * 고객사 권한과 고객사 필터 해석
 */

import { ForbiddenError } from '@/lib/errors';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import { AuthenticatedUser } from '@/types/session';

import { type ClientAccessFields, isInternalUser } from './core';
import { resolveAssigneeScope } from './role';

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

/**
 * 고객사 상세에 소속 사용자 명부(이름·이메일·역할)를 실을 수 있는가.
 *
 * 헌법 §1.2 의 "고객사 사용자 정보는 배정 범위로 제한" 에 따라 담당자 스코프 사용자(ENGINEER)에게는
 * 싣지 않는다. 사용자 목록 메뉴를 ENGINEER 에게 숨긴 것(USER:READ 없음)과 같은 취지인데, 고객사
 * 상세·조직도 경로로는 같은 명부가 그대로 나가고 있었다.
 *
 * ⚠️ 외부 사용자(CLIENT_ADMIN·CLIENT_USER)는 지금 자사 명부를 받는다(스코프 없음 → true). PRD 권한표는
 * CLIENT_USER 에게 고객사 조회 ❌·사용자 조회는 본인만으로 적고 있어 이 부분은 정책 미결이다.
 */
export function canViewClientRoster(user: AuthenticatedUser): boolean {
  return resolveAssigneeScope(user) === undefined;
}

/**
 * 목록 조회의 고객사 필터를 세션과 요청 파라미터로부터 도출한다.
 * `srs/route.ts` 와 `users/route.ts` 에 글자까지 동일하게 복제돼 있던 블록의 추출이다.
 *
 * 내부 사용자(ADMIN/MANAGER/ENGINEER)는 요청한 clientId 를 그대로 쓴다.
 * 외부 사용자는 본인 소속 고객사로만 바운딩되고, 소속이 없거나 타 테넌트를
 * 요청하면 `{ in: [] }` 를 돌려준다 — 호출부는 이때 빈 목록으로 즉시 응답한다.
 *
 * **`'all'` 같은 문자열을 특별 취급하지 않는다.** 필터 UI 의 '전체' 선택은
 * `SRsDataTable.tsx:187` 이 쿼리스트링을 만들기 전에 이미 걷어내므로 여기까지
 * 오지 않고, 여기서 `'all'` 을 "필터 없음"으로 해석하면 외부 사용자가
 * `?clientId=all` 을 직접 호출했을 때의 결과가 빈 목록에서 소속 고객사 전체로
 * 바뀐다. 추출은 동작을 보존해야 한다.
 */
export function resolveClientIdFilter(
  user: AuthenticatedUser,
  requestedClientId?: string | null
): { in: string[] } | string | undefined {
  const clientIdFilter = requestedClientId || undefined;

  if (isInternalUser(user)) {
    return clientIdFilter;
  }

  const userClientIds = user.clientIds || [];
  if (userClientIds.length === 0) {
    return { in: [] };
  }

  if (typeof clientIdFilter === 'string') {
    // 소속되지 않은 타 테넌트를 지정했으면 빈 결과로 차단한다.
    return userClientIds.includes(clientIdFilter) ? clientIdFilter : { in: [] };
  }

  return { in: userClientIds };
}
