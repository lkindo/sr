/**
 * SR 권한: 읽기·수정·삭제·첨부·접수·배정, 실시간 이벤트 수신, 조회 범위
 */

import { Prisma, SRStatus } from '@prisma/client';

import { ForbiddenError } from '@/lib/errors';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import {
  canViewerAssignSR,
  canViewerIntakeSR,
  getRequiredFields,
  isSROperator,
  SR_CLOSED_STATUSES,
  SR_CONTENT_LOCKED_MESSAGE,
} from '@/lib/sr-state-machine';
import { AuthenticatedUser } from '@/types/session';

import { isInternalUser, type SRAccessFields } from './core';
import { resolveAssigneeScope } from './role';

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

/**
 * 접수 정보는 자기 고객사 SR 만 다룬다(POST·PATCH 공용). SR:INTAKE 를 받은 외부 커스텀 역할이
 * 다른 고객사 SR 을 건드리지 못하게 한다. 내부 사용자에게는 고객사 경계가 없다.
 */
export function ensureCanIntakeClientSR(user: AuthenticatedUser, sr: { clientId: string }): void {
  if (!isInternalUser(user) && !(user.clientIds ?? []).includes(sr.clientId)) {
    throw new ForbiddenError('해당 고객사의 SR을 접수 처리할 권한이 없습니다.');
  }
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
 * 접수 정보 수정은 이미 접수된 SR 을 고치는 일이다. 미배정 SR 을 허용하는 접수 판정
 * (canIntakeAssignedSR)을 그대로 쓰면, 담당자가 해제된 SR 을 범위 밖 사용자가 고치고 본문까지 받는다.
 * 담당자 스코프 사용자는 자기 배정분만 고친다.
 */
export function ensureCanUpdateIntake(
  user: AuthenticatedUser,
  sr: { assigneeId: string | null }
): void {
  const scope = resolveAssigneeScope(user);
  if (scope !== undefined && sr.assigneeId !== scope) {
    throw new ForbiddenError('자신에게 배정된 SR의 접수 정보만 수정할 수 있습니다.');
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
/** 어떤 SR 과도 일치하지 않는 조건. */
const NO_SR_MATCH: Prisma.SRWhereInput = { id: { in: [] } };

/**
 * SR 목록·건수 조회의 기본 스코프 — 보는 사람이 볼 수 있는 SR 만.
 *
 * canReadSR 과 **같은 판정 순서**를 조건식으로 옮긴 것이다. 규칙이 갈라지면 상세는 403 인데
 * 목록에는 제목과 담당자가 보이는 상태가 된다. 한쪽을 고치면 다른 쪽도 함께 고친다.
 *  - ADMIN, SR:READ 가 있는 MANAGER: 제한 없음.
 *  - ENGINEER: SR:READ 가 있으면 자기 배정분만, 없으면 없음.
 *  - 그 외: 소속 고객사의 SR. SR:READ 없이 SR:UPDATE_SELF 만 있으면 그중 본인이 신청한 것만.
 *
 * 헌법 §1.2: 스코프는 선택 인자로 두지 않는다. 예전에는 srService.getAllSRs/countSRs 가 스코프를 호출부의
 * `where` 에 맡겨서, 호출부가 빠뜨리면 전 테넌트가 반환됐다. 이제 두 함수가 필수 인자인 viewer 로부터 이
 * 스코프를 직접 건다(호출부의 where 는 그 위에 AND 로 더해질 뿐이다).
 */
export function srViewerScopeWhere(user: AuthenticatedUser): Prisma.SRWhereInput {
  if (user.roles?.includes('ADMIN')) return {};

  const canRead = hasPermissionFlag(user, PERMISSIONS.SR.READ);
  if (user.roles?.includes('MANAGER') && canRead) return {};

  if (user.roles?.includes('ENGINEER')) {
    return canRead ? { assigneeId: user.id } : NO_SR_MATCH;
  }

  const clientScope = { clientId: { in: user.clientIds ?? [] } };
  if (canRead) return clientScope;

  return hasPermissionFlag(user, PERMISSIONS.SR.UPDATE_SELF)
    ? { ...clientScope, requesterId: user.id }
    : NO_SR_MATCH;
}

export function clientSrScopeWhere(user: AuthenticatedUser): Prisma.SRWhereInput {
  const assigneeId = resolveAssigneeScope(user);
  return assigneeId ? { assigneeId } : {};
}
