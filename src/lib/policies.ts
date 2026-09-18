/**
 * Policy Functions - 함수 기반 권한 검증
 *
 * 클래스 기반 Policy를 함수로 간소화하여 단순하고 명확한 권한 검증 제공
 */

import { Client, Prisma, Role, SR, SRStatus, User } from '@prisma/client';

import { BusinessRuleError, ForbiddenError } from '@/lib/errors';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import { isCanonicalRole, isImmutableRole, isReservedRoleName } from '@/lib/role-rules';
import {
  canViewerAssignSR,
  canViewerIntakeSR,
  getRequiredFields,
  isSROperator,
  SR_CLOSED_STATUSES,
  SR_CONTENT_LOCKED_MESSAGE,
} from '@/lib/sr-state-machine';
import { AuthenticatedUser } from '@/types/session';

export const INTERNAL_ROLES = ['ADMIN', 'MANAGER', 'ENGINEER'];

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
  roles?: { role: { name: string } }[] | null;
};

/** 역할 할당 정책이 비교하는 최소 역할/권한 형태. */
export type RoleGrantFields = {
  name: string;
  permissions?: { permission: { resource: string; action: string } }[] | null;
};

/**
 * 시스템 관리자(ADMIN)인가. ADMIN 전용 기능(시스템 설정·알림 아웃박스·사용자 완전 삭제)의 판정.
 * 예전에는 각 라우트가 `roles.includes('ADMIN')` 을 직접 비교했다(헌법 §1.2 — 판정은 이 파일 한 곳).
 */
export function isSystemAdmin(user: AuthenticatedUser): boolean {
  return user.roles?.includes('ADMIN') ?? false;
}

export function ensureSystemAdmin(user: AuthenticatedUser, message: string): void {
  if (!isSystemAdmin(user)) {
    throw new ForbiddenError(message);
  }
}

/** 이 권한을 실제로 가졌는가 — ADMIN 은 모든 권한을 암묵적으로 가진다(서버 정책 전반과 같다). */
export function hasEffectivePermission(user: AuthenticatedUser, permission: string): boolean {
  return isSystemAdmin(user) || hasPermissionFlag(user, permission);
}

export function isInternalUser(user: AuthenticatedUser): boolean {
  return user.roles?.some((role) => INTERNAL_ROLES.includes(role)) ?? false;
}

/**
 * 이 SSE 연결(viewer)이 실시간 이벤트를 받을 자격이 있는가.
 *  - 본인이 유발한 이벤트는 받지 않는다(에코 방지).
 *  - 내부 전용 이벤트(내부 노트 등 — `internalOnly`)는 내부 사용자만 받는다. 이벤트가 왔다는 사실만으로도
 *    고객에게 보이지 않는 댓글이 있음이 드러난다.
 *  - 나머지는 SR 조회 권한(canReadSR)으로 테넌트·담당자 범위를 격리한다.
 */
export function canReceiveRealtimeEvent(
  viewer: AuthenticatedUser,
  payload: {
    id?: string;
    srId?: string;
    clientId?: string;
    requesterId?: string | null;
    assigneeId?: string | null;
    actorId?: string;
    internalOnly?: boolean;
  } | null
): boolean {
  if (payload?.actorId && payload.actorId === viewer.id) return false;
  if (payload?.internalOnly && !isInternalUser(viewer)) return false;
  return canReadSR(viewer, {
    id: payload?.id ?? payload?.srId ?? '',
    clientId: payload?.clientId ?? '',
    // 신청자가 실리지 않은 이벤트는 신청자 경로로 열리지 않게 빈 값으로 둔다(어떤 사용자 id 와도 같지 않다).
    requesterId: payload?.requesterId ?? '',
    assigneeId: payload?.assigneeId ?? null,
  });
}

/**
 * 고객을 대신해 SR 을 등록할 수 있는가(대리 등록 — 소유자 결정 2026-09-18 D3). 내부 사용자만.
 * 고객사 관리자가 동료 이름으로 SR 을 만드는 것은 결정 범위 밖이라 열지 않는다.
 */
export function canRegisterSROnBehalf(user: AuthenticatedUser): boolean {
  return isInternalUser(user);
}

/**
 * 이 고객사의 SR 신청자가 될 수 있는 사용자 — 활성이고, 그 고객사 소속이 **승인**됐고, 내부 역할이 없다.
 * 대리 등록 대상 목록(화면)과 서버 검증이 같은 조건을 쓰도록 한 곳에 둔다.
 */
export function eligibleRequesterWhere(clientId: string): Prisma.UserWhereInput {
  return {
    isActive: true,
    clients: { some: { clientId, status: 'APPROVED' } },
    roles: { none: { role: { name: { in: INTERNAL_ROLES } } } },
  };
}

/**
 * 내부 노트(고객에게 보이지 않는 댓글)를 쓸 수 있는가 — 내부 사용자(ADMIN·MANAGER·ENGINEER)만.
 * 헌법 §1.1 "ENGINEER·MANAGER·ADMIN만 작성 및 조회" 와 읽기 쪽 visibleCommentsWhere 와 같은 경계다.
 */
export function canWriteInternalNote(user: AuthenticatedUser): boolean {
  return isInternalUser(user);
}

/**
 * 이 사용자에게 보여도 되는 댓글만 고르는 where 조각. 내부 댓글(`isInternal`)은 내부 사용자에게만 보인다.
 *
 * 댓글을 읽거나 세는 경로는 전부 이것을 쓴다 — SR 상세(`getSRDetailsById`), 댓글 탭(`getSRComments`),
 * REST `GET /api/srs/[id]/comments`, SR 목록의 댓글 수(`getAllSRs`), 내 요청의 댓글 수. 예전에는
 * 앞의 세 곳이 같은 삼항식을 각자 복제했고, 뒤의 두 곳은 필터가 아예 없어 내부 댓글이 생기면
 * 고객사 사용자의 목록에만 그 개수가 섞일 상태였다. 규칙이 여러 곳에 있으면 반드시 갈라진다.
 */
export function visibleCommentsWhere(user: AuthenticatedUser): Prisma.SRCommentWhereInput {
  return isInternalUser(user) ? {} : { isInternal: false };
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

  // MANAGER 는 권한 보유만으로 통과한다.
  if (user.roles?.includes('MANAGER')) return true;

  // ENGINEER 는 권한을 받아도 자기에게 배정된 SR 만 — 배정 격리(헌법 §1.2)는 권한 조정으로 풀리지
  // 않는다(§1.4). 예전에는 내부 사용자라는 이유로 통과해 보이지도 않는 남의 SR 까지 지울 수 있었다.
  if (user.roles?.includes('ENGINEER')) return sr.assigneeId === user.id;

  // 외부 사용자는 자기 테넌트의 SR 로 제한한다.
  return user.clientIds?.includes(sr.clientId) ?? false;
}

/**
 * 종결된 SR. 이 상태의 레코드는 감사 추적 대상이므로 첨부를 붙일 수 없다.
 * 목록은 화면(첨부 업로드 버튼)과 같이 쓰도록 sr-state-machine 에 있다.
 */
const CLOSED_SR_STATUSES: ReadonlySet<string> = new Set(SR_CLOSED_STATUSES);

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

  // `ATTACHMENT:CREATE` 는 카탈로그에 있고 다섯 역할 모두에 부여되지만 어디서도
  // 검사되지 않았다(감사 4.1). 회수해도 아무 일도 일어나지 않는 통제였다.
  // 시드 역할은 전부 보유하므로 이 검사가 기존 동작을 바꾸지 않는다.
  if (!user.roles?.includes('ADMIN') && !hasPermissionFlag(user, PERMISSIONS.ATTACHMENT.CREATE)) {
    throw new ForbiddenError('첨부파일 업로드 권한이 없습니다.');
  }

  if (CLOSED_SR_STATUSES.has(sr.status)) {
    throw new ForbiddenError(
      // 상태 이름은 정본(constants/sr.ts 의 statusLabels)을 따른다.
      // 예전에는 '완료/확정/반려' 였다 — 한 문장에 비정본 표기가 둘이었고,
      // 사용자가 '반려' 라는 단어를 만나는 유일한 지점이 여기였다.
      '종결된 SR(완료/확인완료/거절)에는 첨부파일을 추가할 수 없습니다. 필요하면 SR을 다시 열어주세요.'
    );
  }
}

/**
 * 댓글 작성 권한.
 *
 * SR 을 읽을 수 있는 것과 거기에 쓸 수 있는 것은 다르다. 예전에는 댓글 POST 가
 * `ensureCanReadSR` 만 통과하면 됐고 `COMMENT:CREATE` 는 검사되지 않았다(감사 4.1).
 */
export function ensureCanCommentOnSR(user: AuthenticatedUser, sr: SRAccessFields): void {
  ensureCanReadSR(user, sr);

  if (!user.roles?.includes('ADMIN') && !hasPermissionFlag(user, PERMISSIONS.COMMENT.CREATE)) {
    throw new ForbiddenError('댓글 작성 권한이 없습니다.');
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

/**
 * SR 의 **운영자 소유 값**(접수 결과·완료 내용·거절 사유 등)을 쓸 수 있는 사용자인가.
 * 내부 사용자(ADMIN/MANAGER/ENGINEER) 또는 SR:ASSIGN 보유자(외부 커스텀 운영 역할 포함).
 *
 * 필드 단위 인가(sr.service 의 collectOperatorFieldChanges)와 내용 수정 규칙(ensureCanEditSRContent)이
 * 같은 판정을 써야 한다. 예전에는 앞쪽만 SR:ASSIGN 을 운영자로 인정해서, SR:ASSIGN 을 받은 외부 역할은
 * 우선순위는 고칠 수 있는데 완료 내용은 쓸 수 없는 식으로 두 규칙이 서로 다른 사람을 운영자로 봤다.
 * 판정 본문은 화면과 같이 쓰는 sr-state-machine.isSROperator 다.
 */
export function canWriteSROperatorFields(user: AuthenticatedUser): boolean {
  return isSROperator(user);
}

/**
 * 상태 전이 요청에 함께 실려 오는 **전이 전용 값**. 이 값들은 상태머신이 판정한다
 * (전이 권한 — validateTransition, 필수 값 — REQUIRED_FIELDS). 목록은 status 라우트가 전이마다 싣는
 * 값과 같다: 완료 → 완료 내용, 거절 → 거절 사유, 보류 → 예상 해제일, 재개 → 예상 해제일 비우기,
 * 진행 → 담당자(assigneeId, 별칭 assignedToId — 담당자 변경은 운영자 필드 규칙이 따로 막는다).
 */
function transitionOwnedKeys(from: string, to: string): Set<string> {
  const keys = new Set<string>(['status', 'changeReason', ...getRequiredFields(to as SRStatus)]);
  if (keys.has('assigneeId')) keys.add('assignedToId');
  if (from === 'ON_HOLD') keys.add('expectedHoldReleaseDate');
  return keys;
}

/**
 * 운영자가 아닌 사용자가 SR **내용**을 직접 고칠 수 있는가.
 *
 * 규칙(소유자 결정, 2026-09-18 — 헌법 §1.1, PRD §특수 권한 규칙):
 *  1. **접수 이후 SR 내용은 운영자만 고친다**(ADMIN·MANAGER·배정 ENGINEER, SR:ASSIGN 보유 역할).
 *     외부 사용자는 신청자든 고객사 관리자든 접수 전(REQUESTED)에만 고칠 수 있고, 그 뒤 변경은 댓글로
 *     담당자에게 요청한다. SLA 는 접수 시점의 요구를 근거로 산정되므로 그 뒤 요구 범위가 조용히 바뀌면
 *     근거가 흔들린다. 만족도·추가 의견은 고객이 결과를 받은 뒤 남기는 값이라 예외다.
 *     (ENGINEER 가 **자기 배정분만** 고칠 수 있다는 범위는 ensureCanUpdateSR 이 이미 판정한다.)
 *  2. 완료 내용·거절 사유는 운영자만 쓴다 — REQUESTED 에서도. 미리 채워 두면 운영자가 완료·거절할 때
 *     필수 입력 검사를 비어 있는 채로 통과한다. 단, 그 값을 요구하는 전이 자체에 실려 온 경우는
 *     상태머신이 전이 권한으로 판정한다.
 *
 * 예전에는 이 규칙이 화면(수정 버튼·다이얼로그)에만 있어서 API(PATCH /api/srs/[id], updateSRAction)로는
 * 접수·완료 뒤에도 제목·본문과 완료 내용·거절 사유를 덮어쓰거나 지울 수 있었다.
 *
 * 상태 전이 요청도 이 검사를 지난다. 전이 전용 값(transitionOwnedKeys)만 빼고 나머지를 본다 —
 * 전이 요청이라는 이유로 통째로 건너뛰면 `{status:'CONFIRMED', title:'…'}` 처럼 전이에 내용 수정을
 * 끼워 넣어 규칙을 우회할 수 있다.
 */
export function ensureCanEditSRContent(
  user: AuthenticatedUser,
  sr: { status: string },
  changes: { status?: unknown; [key: string]: unknown }
): void {
  if (canWriteSROperatorFields(user)) return;

  const isTransition = typeof changes.status === 'string' && changes.status !== sr.status;
  const exempt = isTransition
    ? transitionOwnedKeys(sr.status, changes.status as string)
    : new Set(['status', 'changeReason']);
  const content = Object.entries(changes)
    .filter(([key, value]) => value !== undefined && !exempt.has(key))
    .map(([key]) => key);

  if (content.some((key) => OPERATOR_WRITTEN_FIELDS.has(key))) {
    throw new ForbiddenError('완료 내용과 거절 사유는 운영 담당자만 작성할 수 있습니다.');
  }
  if (sr.status === 'REQUESTED') return;

  // 만족도·추가 의견은 고객이 처리 결과를 받은 뒤 남기는 **고객 소유** 값이라 접수 후에도 허용한다.
  if (content.some((key) => !CUSTOMER_FEEDBACK_FIELDS.has(key))) {
    throw new ForbiddenError(SR_CONTENT_LOCKED_MESSAGE);
  }
}

/** 운영자가 완료·거절하며 쓰는 값. 외부 사용자는 전이 요청에 실린 경우가 아니면 쓸 수 없다. */
const OPERATOR_WRITTEN_FIELDS = new Set(['resolutionDescription', 'rejectionReason']);

/** 접수 후에도 외부 사용자가 쓸 수 있는 고객 피드백 필드. */
const CUSTOMER_FEEDBACK_FIELDS = new Set(['satisfactionRating', 'additionalFeedback']);

/**
 * 첨부파일을 지울 수 있는가.
 *
 * 이 규칙은 원래 **화면에만** 있었다. src/app/(dashboard)/srs/[id]/page.tsx 가
 * `ADMIN|MANAGER || (신청자 본인 && REQUESTED)` 로 삭제 버튼을 감췄는데,
 * DELETE /api/attachments/[id] 는 `ensureCanUpdateSR` 만 요구했다. 그쪽이 더 넓어서
 * CLIENT_USER 는 SR:UPDATE_SELF 로 자사 SR 을 수정할 수 있으므로, 접수(INTAKE) 이후에도
 * API 로는 첨부를 지울 수 있었다 — 통제가 버튼을 숨기는 것뿐이었다.
 *
 * 이제 규칙은 여기 하나뿐이고 화면과 API 가 같은 함수를 부른다.
 *
 * 접수 전(REQUESTED)까지만 신청자에게 허용하는 이유: 접수 이후의 첨부는 운영팀이
 * 판단 근거로 삼는 자료라, 요청자가 임의로 지우면 처리 이력이 사라진다.
 */
export function canDeleteAttachment(
  user: AuthenticatedUser,
  // `status` 는 **필수**다. 선택적으로 두면 호출부가 select 로 필드를 좁혔을 때
  // 타입 오류 없이 `undefined` 가 들어오고, 아래 `status === 'REQUESTED'` 분기가
  // 영원히 거짓이 되어 **요청자 본인의 첨부 삭제가 조용히 막힌다.**
  // 인가에 쓰는 값은 없으면 컴파일이 실패하는 편이 낫다(감사 D-20).
  sr: SRAccessFields & { requesterId?: string | null; status: string }
): boolean {
  if (!canUpdateSR(user, sr)) return false;

  const roles = user.roles ?? [];
  if (roles.includes('ADMIN') || roles.includes('MANAGER')) return true;

  return sr.requesterId === user.id && sr.status === 'REQUESTED';
}

export function ensureCanDeleteAttachment(
  user: AuthenticatedUser,
  sr: SRAccessFields & { requesterId?: string | null; status: string }
): void {
  if (!canDeleteAttachment(user, sr)) {
    throw new ForbiddenError('첨부파일 삭제 권한이 없습니다.');
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

function targetHasRole(targetUser: UserIdentity, roleName: string): boolean {
  return (targetUser.roles ?? []).some((entry) => entry.role.name === roleName);
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
  if (!canDeleteUser(user, targetUser)) {
    throw new ForbiddenError('사용자 삭제 권한이 없습니다.');
  }
}

// ============================================================================
// Role 권한 함수
// ============================================================================

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

/**
 * SR 목록을 CSV 로 내보낼 수 있는가 — 내부 사용자만. 내보내는 범위는 목록·상세와 같은 담당자 스코프
 * (resolveAssigneeScope — ENGINEER 는 자기 배정분)를 따른다.
 */
export function canExportSRs(user: AuthenticatedUser): boolean {
  return isInternalUser(user);
}

/**
 * SR 을 접수(트리아지)할 수 있는가 — ADMIN·MANAGER, 또는 SR:INTAKE 를 받은 커스텀 역할.
 *
 * 소유자 결정(2026-09-18): 접수·담당자 배정은 운영 관리자의 공용 큐 업무다(헌법 §1.1·§4, PRD 배정 ❌).
 * 예전에는 접수 API 가 내부 역할 전원(ENGINEER 포함)에게 열려 있어서, 화면에는 접수 버튼이 없는
 * ENGINEER 가 API 로 미배정 SR 을 접수하며 담당자를 아무나(자기 포함) 지정할 수 있었다.
 * 시드 ENGINEER 의 SR:INTAKE 도 같은 결정으로 회수했다(마이그레이션 20260918120000).
 */
export function canIntakeSR(user: AuthenticatedUser): boolean {
  // 판정 본문은 화면과 같이 쓰는 sr-state-machine.canViewerIntakeSR 다.
  return canViewerIntakeSR(user);
}

export function ensureCanIntakeSR(user: AuthenticatedUser): void {
  if (!canIntakeSR(user)) {
    throw new ForbiddenError(
      'SR 접수 권한이 없습니다. 접수는 운영 관리자(ADMIN·MANAGER)가 합니다.'
    );
  }
}

/**
 * SR 의 담당자를 배정·변경할 수 있는가 — ADMIN·MANAGER, 또는 SR:ASSIGN 을 받은 커스텀 역할.
 *
 * 소유자 결정(2026-09-18, D1). 예전에는 일반 수정 경로(updateSR)에서 배정된 ENGINEER 도 담당자를
 * 바꿀 수 있었다 — 자기 배정분을 다른 엔지니어에게 넘기는 것이 운영 관리자 모르게 가능했다.
 */
export function canAssignSR(user: AuthenticatedUser): boolean {
  return canViewerAssignSR(user);
}

/**
 * 이미 다른 사람에게 배정된 SR 을 접수(담당자 재지정)로 가져갈 수 있는가.
 *
 * 헌법 §1.1: ENGINEER 는 "타 엔지니어에게 할당된 SR은 임의로 변경할 수 없다". 접수 POST 는 담당자를
 * 새로 지정하므로(assigneeId 필수), 이 검사가 없으면 담당자 스코프 사용자가 남에게 배정된 SR 을
 * 가로채고 그 본문까지 읽게 된다. 판정은 목록·상세와 같은 담당자 스코프(resolveAssigneeScope)를
 * 쓴다 — 담당자 스코프가 걸린 사용자는 자기 배정분만, 스코프가 없는 사용자는 재배정할 수 있다.
 *
 * "스코프가 없는 사용자" 는 ADMIN·MANAGER 만이 아니다. resolveAssigneeScope 는 ENGINEER 에게만
 * 스코프를 건다. 그래서 다음도 여기서는 통과한다:
 *  - ENGINEER 와 ADMIN, 또는 ENGINEER 와 MANAGER(+SR:READ) 를 함께 가진 사용자(상위 역할이 이긴다).
 *  - SR:READ 가 없는 MANAGER.
 *  - SR:INTAKE 를 받은 외부 커스텀 역할 — 테넌트 검사(자기 고객사 SR 만)는 라우트가 따로 한다.
 * 이 사용자들이 남의 배정분을 재배정해도 되는지, 미배정 SR 을 누가 접수할 수 있는지는 여기서
 * 정하지 않는다(정책 미결 — 역할·권한 게이트가 판정한다).
 */
export function canIntakeAssignedSR(
  user: AuthenticatedUser,
  sr: { assigneeId: string | null }
): boolean {
  if (!sr.assigneeId) return true;
  const scope = resolveAssigneeScope(user);
  return scope === undefined || scope === sr.assigneeId;
}

export function ensureCanIntakeAssignedSR(
  user: AuthenticatedUser,
  sr: { assigneeId: string | null }
): void {
  if (!canIntakeAssignedSR(user, sr)) {
    throw new ForbiddenError('다른 담당자에게 배정된 SR은 접수할 수 없습니다.');
  }
}

/**
 * 고객사 화면(상세의 최근 SR·SR 건수, 목록의 SR 건수)에 거는 **담당자 스코프**.
 *
 * 헌법 §1.2: ENGINEER 는 고객사 명부·서비스 카테고리는 전체를 보지만 "SR 본문·고객사 사용자
 * 정보·SR 통계는 자신에게 배정된 범위로 제한" 된다. 예전에는 고객사 상세·목록이 ENGINEER 에게 전
 * 고객사의 최근 SR(번호·제목·상태)과 SR 건수를 보여 줬다. 목록·상세와 같은 resolveAssigneeScope 를 쓴다.
 * 고객사 경계 자체는 canReadClient 가 판정하므로 여기서는 담당자 축만 더한다.
 */
/**
 * SR 목록·건수 조회의 기본 스코프 — 보는 사람이 볼 수 있는 SR 만.
 *  - 외부 사용자: 소속(승인된) 고객사의 SR 만. 소속이 없으면 아무것도 보지 않는다(빈 IN).
 *  - 담당자 스코프 사용자(ENGINEER): 자기 배정분만(resolveAssigneeScope).
 *  - 그 외 내부 사용자: 제한 없음.
 *
 * 헌법 §1.2: 스코프는 선택 인자로 두지 않는다. 예전에는 srService.getAllSRs/countSRs 가 스코프를 호출부의
 * `where` 에 맡겨서, 호출부가 빠뜨리면 전 테넌트가 반환됐다. 이제 두 함수가 필수 인자인 viewer 로부터 이
 * 스코프를 직접 건다(호출부의 where 는 그 위에 AND 로 더해질 뿐이다).
 */
export function srViewerScopeWhere(user: AuthenticatedUser): Prisma.SRWhereInput {
  if (!isInternalUser(user)) return { clientId: { in: user.clientIds ?? [] } };
  const assigneeId = resolveAssigneeScope(user);
  return assigneeId ? { assigneeId } : {};
}

export function clientSrScopeWhere(user: AuthenticatedUser): Prisma.SRWhereInput {
  const assigneeId = resolveAssigneeScope(user);
  return assigneeId ? { assigneeId } : {};
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
