/**
 * 상태 전이 규칙: 전이 표, 상태 동작, 필요 권한·역할·필드와 전이 검증
 */

import type { SRStatus } from '@prisma/client';

import { statusLabelOf } from '@/lib/constants/sr';

import {
  canConfirmAsAcceptor,
  getReopenBlock,
  isRejectBlockedAfterCompletion,
  isReopenTransition,
  SR_REJECT_AFTER_COMPLETION_MESSAGE,
} from './rules';

/**
 * 각 상태에서 전환 가능한 다음 상태들.
 * `GEMINI.md` §2 의 전이표와 1:1 대응한다 — 한쪽만 고치면 규범과 구현이 갈린다.
 */
export const VALID_TRANSITIONS: Record<SRStatus, SRStatus[]> = {
  REQUESTED: ['INTAKE', 'REJECTED'],
  INTAKE: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['COMPLETED', 'ON_HOLD'],
  ON_HOLD: ['IN_PROGRESS', 'REJECTED'],
  COMPLETED: ['CONFIRMED', 'IN_PROGRESS'], // IN_PROGRESS for Reopen
  CONFIRMED: ['IN_PROGRESS'], // 7일 이내 재오픈 허용
  REJECTED: [], // Terminal state (No Re-request)
};

/**
 * 상태 변경 액션의 값. 액션은 전이보다 좁다. 시작, 재개, 재오픈은 모두 진행중으로 가지만
 * 출발 상태가 다르다. 각 항목이 `VALID_TRANSITIONS` 안에 있는지는 테스트가 검사한다.
 */
export type SRStatusAction =
  'start' | 'complete' | 'hold' | 'resume' | 'reject' | 'confirm' | 'reopen';

export interface SRStatusActionInput {
  reason?: string;
  resolutionDescription?: string;
  expectedHoldReleaseDate?: string;
}

interface SRStatusActionFields {
  resolutionDescription?: string;
  rejectionReason?: string;
  /** null 은 보류 해제로 지난 약속을 비운다는 뜻이다. */
  expectedHoldReleaseDate?: string | null;
}

interface SRStatusActionRule {
  from: SRStatus[];
  to: SRStatus;
  wrongStatusMessage: string;
  required?: Array<{ field: keyof SRStatusActionInput; message: string }>;
  fields?: (input: SRStatusActionInput) => SRStatusActionFields;
}

export const SR_STATUS_ACTIONS: Record<SRStatusAction, SRStatusActionRule> = {
  start: {
    from: ['INTAKE'],
    to: 'IN_PROGRESS',
    wrongStatusMessage: '접수 상태에서만 진행을 시작할 수 있습니다.',
  },
  complete: {
    from: ['IN_PROGRESS'],
    to: 'COMPLETED',
    wrongStatusMessage: '진행중 상태에서만 완료 처리할 수 있습니다.',
    required: [{ field: 'resolutionDescription', message: '해결 내용을 입력해주세요.' }],
    fields: ({ resolutionDescription }) => ({ resolutionDescription }),
  },
  hold: {
    from: ['IN_PROGRESS'],
    to: 'ON_HOLD',
    wrongStatusMessage: '진행중 상태에서만 보류할 수 있습니다.',
    // 헌법 §2: 보류는 사유 **와** 예상 해제일을 함께 명시한다.
    required: [
      { field: 'reason', message: '보류 사유를 입력해주세요.' },
      { field: 'expectedHoldReleaseDate', message: '예상 해제일을 입력해주세요.' },
    ],
    fields: ({ expectedHoldReleaseDate }) => ({ expectedHoldReleaseDate }),
  },
  resume: {
    from: ['ON_HOLD'],
    to: 'IN_PROGRESS',
    wrongStatusMessage: '보류 상태에서만 재개할 수 있습니다.',
    // 남겨 두면 진행중 SR 에 지난 해제 예정일이 붙고, 다음 보류 때 그 값으로 필수 검사를 통과한다.
    fields: () => ({ expectedHoldReleaseDate: null }),
  },
  reject: {
    from: ['REQUESTED', 'INTAKE', 'ON_HOLD'],
    to: 'REJECTED',
    wrongStatusMessage: '요청됨, 접수, 보류 상태에서만 거절할 수 있습니다.',
    required: [{ field: 'reason', message: '거절 사유를 입력해주세요.' }],
    fields: ({ reason }) => ({ rejectionReason: reason }),
  },
  // 신원 판정은 validateTransition 의 canConfirmAsAcceptor 가 한다.
  confirm: {
    from: ['COMPLETED'],
    to: 'CONFIRMED',
    wrongStatusMessage: '완료 상태에서만 확인할 수 있습니다.',
  },
  // 7일 창은 validateTransition 이 단일 판정 지점이다. 사본을 두면 두 곳의 판정이 갈린다.
  reopen: {
    from: ['COMPLETED', 'CONFIRMED'],
    to: 'IN_PROGRESS',
    wrongStatusMessage: '완료 또는 확인완료 상태에서만 재오픈할 수 있습니다.',
    required: [{ field: 'reason', message: '재오픈 사유를 입력해주세요.' }],
  },
};

/**
 * 액션을 목표 상태와 저장할 값으로 바꾼다. 출발 상태가 맞지 않거나 필수 입력이 없으면 이유를 돌려준다.
 * 권한과 재오픈 창 같은 나머지 규칙은 저장 시점의 `validateTransition` 이 판정한다.
 */
export function planStatusAction(
  action: SRStatusAction,
  current: SRStatus,
  input: SRStatusActionInput
): { ok: true; to: SRStatus; fields: SRStatusActionFields } | { ok: false; message: string } {
  const rule = SR_STATUS_ACTIONS[action];
  if (!rule.from.includes(current)) {
    return { ok: false, message: rule.wrongStatusMessage };
  }
  const missing = rule.required?.find(({ field }) => !input[field]);
  if (missing) {
    return { ok: false, message: missing.message };
  }
  return { ok: true, to: rule.to, fields: rule.fields?.(input) ?? {} };
}

/**
 * 상태 전이별 필요한 **권한**.
 *
 * 앱의 나머지 인가는 전부 permission 기반인데 전이만 리터럴 역할명으로 판정하고 있었다.
 * 그래서 운영자가 RBAC 화면에서 `SR:UPDATE` + `SR:STATUS_CHANGE` 를 준 커스텀 역할을
 * 만들면 `canUpdateSR` 은 통과하지만 **전이는 단 하나도 못 한다** — 관리 UI 가 조용히
 * 쓸 수 없는 역할을 찍어내고 있었다(감사 4.3).
 *
 * 권한을 가진 사용자는 아래 `TRANSITION_ROLES` 의 역할 목록에 없어도 전이할 수 있다.
 * 두 경로는 OR 로 결합한다 — 기존 시드 역할의 동작을 바꾸지 않으면서 커스텀 역할을 살린다.
 */
export const TRANSITION_PERMISSIONS: Record<string, Record<string, string[]>> = {
  REQUESTED: {
    INTAKE: ['SR:INTAKE'],
    REJECTED: ['SR:STATUS_CHANGE'],
  },
  INTAKE: {
    IN_PROGRESS: ['SR:STATUS_CHANGE'],
    REJECTED: ['SR:STATUS_CHANGE'],
  },
  IN_PROGRESS: {
    COMPLETED: ['SR:STATUS_CHANGE'],
    ON_HOLD: ['SR:STATUS_CHANGE'],
  },
  ON_HOLD: {
    IN_PROGRESS: ['SR:STATUS_CHANGE'],
    REJECTED: ['SR:STATUS_CHANGE'],
  },
  COMPLETED: {
    // 확인은 고객 인수 행위다. 운영자가 대신 눌러서는 안 되므로 SR:CONFIRM 단독.
    CONFIRMED: ['SR:CONFIRM'],
    // 재오픈도 SR:CONFIRM 이다. 처음엔 `['SR:CONFIRM','SR:STATUS_CHANGE']` 로 두었는데,
    // 시드 ENGINEER 가 SR:STATUS_CHANGE 를 보유하므로 아래 TRANSITION_ROLES 가 ENGINEER 를
    // 제외한 것이 권한 경로로 곧장 우회됐다 — 고치려던 것과 똑같은 종류의 발산이다.
    // MANAGER 는 역할 경로로 이미 통과하므로 여기서 넓힐 필요가 없다.
    IN_PROGRESS: ['SR:CONFIRM'],
  },
  CONFIRMED: {
    IN_PROGRESS: ['SR:CONFIRM'],
  },
};

/**
 * 상태 전이별 허용된 역할 정의
 * FromStatus -> ToStatus -> Allowed Roles
 *
 * 시드 역할의 기존 동작을 보존하기 위해 유지한다.
 * 새 역할은 위 `TRANSITION_PERMISSIONS` 로 판정되므로 여기에 추가하지 않아도 된다.
 */
export const TRANSITION_ROLES: Record<string, Record<string, string[]>> = {
  REQUESTED: {
    // 접수는 운영 관리자 공용 큐 업무다 — ENGINEER 제외(소유자 결정 2026-09-18, policies.canIntakeSR).
    INTAKE: ['ADMIN', 'MANAGER'],
    REJECTED: ['ADMIN', 'MANAGER', 'ENGINEER'],
  },
  INTAKE: {
    IN_PROGRESS: ['ADMIN', 'MANAGER', 'ENGINEER'],
    REJECTED: ['ADMIN', 'MANAGER', 'ENGINEER'],
  },
  IN_PROGRESS: {
    COMPLETED: ['ADMIN', 'MANAGER', 'ENGINEER'],
    ON_HOLD: ['ADMIN', 'MANAGER', 'ENGINEER'],
  },
  ON_HOLD: {
    IN_PROGRESS: ['ADMIN', 'MANAGER', 'ENGINEER'],
    REJECTED: ['ADMIN', 'MANAGER', 'ENGINEER'],
  },
  COMPLETED: {
    // 확인은 고객 인수 게이트다. **실제 제한은 이 역할 표가 아니라 아래 validateTransition 의 신원 검사
    // (`canConfirmAsAcceptor`)다** — 역할 표는 "그 SR 의 신청자인가" 를 알지 못한다.
    // MANAGER·ENGINEER 는 소유자 결정(2026-09-18)으로 들어왔다: 운영자가 **자기 이름으로** 등록한 SR 은
    // 고객 신청자가 없어 아무도 확인할 수 없었으므로, 등록한 운영자 본인이 확인할 수 있게 한다. 남의 SR 은
    // 신원 검사가 여전히 막는다(운영자가 고객 대신 확인하는 경로는 없다). ENGINEER 는 배정된 SR 만
    // 수정할 수 있으므로(canUpdateSR) 자기가 등록한 SR 도 **배정됐을 때만** 확인한다 — 그 밖에는 그 고객사의
    // CLIENT_ADMIN 이 확인한다. (시드 ENGINEER 는 SR:CREATE 가 없어 등록 자체를 하지 않는다.)
    CONFIRMED: ['ADMIN', 'MANAGER', 'ENGINEER', 'CLIENT_USER', 'CLIENT_ADMIN'],
    // 재오픈에는 MANAGER 가 포함된다(소유자 결정, 2026-08-01).
    // 근거: ADMIN 은 이미 가능했고, 잘못된 완료 처리를 정정하려면 운영 관리자가
    // ADMIN 을 호출하거나 고객에게 대신 눌러 달라고 부탁해야 했다.
    // 재오픈 다이얼로그가 사유를 필수로 받고 sr_status_history 에 행위자가 남으므로
    // 감사 추적은 유지된다.
    IN_PROGRESS: ['ADMIN', 'MANAGER', 'CLIENT_USER', 'CLIENT_ADMIN'],
  },
  CONFIRMED: {
    // 7일 이내 재오픈. 위와 같은 이유로 MANAGER 포함.
    IN_PROGRESS: ['ADMIN', 'MANAGER', 'CLIENT_USER', 'CLIENT_ADMIN'],
  },
};

/**
 * 상태 전환 가능 여부 확인
 * @param from 현재 상태
 * @param to 목표 상태
 * @returns 전환 가능 여부
 */
export const canTransition = (from: SRStatus, to: SRStatus): boolean => {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
};

/**
 * 현재 상태에서 가능한 모든 전환 목록
 * @param status 현재 상태
 * @returns 가능한 다음 상태 배열
 */
export const getAvailableTransitions = (status: SRStatus): SRStatus[] => {
  return VALID_TRANSITIONS[status] ?? [];
};

/**
 * 상태 전환에 필요한 필수 필드 정보
 */
export const REQUIRED_FIELDS: Partial<Record<SRStatus, string[]>> = {
  IN_PROGRESS: ['assigneeId'],
  COMPLETED: ['resolutionDescription'],
  REJECTED: ['rejectionReason'],
  // 헌법 §2: 보류는 사유 **와** 예상 해제일을 함께 명시한다.
  // 사유는 아래 4번(전이 맥락 규칙)에서 changeReason 으로 강제하고, 날짜는 여기서 강제한다.
  ON_HOLD: ['expectedHoldReleaseDate'],
};

/**
 * 특정 상태로 전환 시 필요한 필드 목록 반환
 * @param toStatus 목표 상태
 * @returns 필수 필드 배열
 */
export const getRequiredFields = (toStatus: SRStatus): string[] => {
  return REQUIRED_FIELDS[toStatus] ?? [];
};

/**
 * 이 사용자가 해당 전이를 **수행할 수 있는지**만 판정한다(필수 필드 검증 제외).
 *
 * UI 가 버튼 가시성을 스스로 판단하지 않고 이 함수를 쓰게 하기 위한 것이다.
 * 예전에는 `SRStatusActions` 가 `hasRole(['ADMIN','MANAGER'])` 로 독립 판단했고,
 * 그 결과 MANAGER 에게 재오픈 버튼이 보이는데 서버는 100% 거부하는 막다른 길이
 * 생겼다(감사 4.3). 규칙과 UI 를 한 곳에서 도출해 발산을 막는다.
 * 지금은 화면이 아래 `getReopenAvailability` 를 부르고, 그 함수가 이것으로 노출을 판정한다
 * (그래서 모듈 밖으로 내보내지 않는다).
 *
 * 필수 필드는 제외한다 — 버튼을 눌러 다이얼로그에서 입력하는 값이므로,
 * 그것 때문에 버튼을 숨기면 채울 방법이 없어진다.
 */
export const canPerformTransition = (
  from: SRStatus,
  to: SRStatus,
  userRoles?: string[],
  userPermissions?: string[]
): boolean => {
  if (!canTransition(from, to)) return false;

  const allowedRoles = TRANSITION_ROLES[from]?.[to];
  const requiredPermission = TRANSITION_PERMISSIONS[from]?.[to];
  if (!allowedRoles && !requiredPermission) return true;

  const hasRole = (userRoles ?? []).some((role) => allowedRoles?.includes(role));
  const hasPermission =
    !!requiredPermission?.length &&
    (userPermissions ?? []).some((p) => requiredPermission.includes(p.toUpperCase()));

  return hasRole || hasPermission;
};

/**
 * 상태 전환 가능 여부와 사유를 함께 반환 (권한 및 필수 데이터 검증 포함)
 * @param from 현재 상태
 * @param to 목표 상태
 * @param userRoles 사용자 역할 목록 (Optional)
 * @param currentData 현재 SR 데이터 (Optional)
 * @param updateData 업데이트할 SR 데이터 (Optional)
 * @param userPermissions 사용자 권한 목록 (Optional)
 * @param actorId 전이를 수행하는 사용자 ID. 신청자 본인만 가능한 전이(CONFIRMED)의 판정에 쓴다.
 * @param actorClientIds 행위자의 소속 고객사. 운영자가 등록한 SR 을 고객사 관리자가 확인하는 예외
 *   (`canConfirmAsAcceptor`)의 판정에 쓴다. 없으면 그 예외는 열리지 않는다(fail-closed).
 * @returns 가능 여부와 메시지
 */
export const validateTransition = (
  from: SRStatus,
  to: SRStatus,
  userRoles?: string[],
  currentData?: any,
  updateData?: any,
  userPermissions?: string[],
  actorId?: string,
  actorClientIds?: string[]
): { valid: boolean; message?: string } => {
  // 1. 상태 흐름 유효성 검사
  if (!canTransition(from, to)) {
    return {
      valid: false,
      message: `${statusLabelOf(from)}에서 ${statusLabelOf(to)}(으)로 직접 전환할 수 없습니다.`,
    };
  }

  // 2. 인가 검사 (역할 OR 권한)
  //
  // **fail-closed 다.** 예전에는 `if (userRoles && userRoles.length > 0)` 로 감싸져 있어
  // roles 가 빈 배열이면 이 블록 전체를 건너뛰고 `{ valid: true }` 로 떨어졌다.
  // `src/auth.ts` 는 사용자 조회에 실패하면 `token.roles = []` 로 세션을 만든다 —
  // 즉 인가 정보를 못 읽은 세션이 **모든 전이를 수행할 수 있었다**(감사 4.3).
  const allowedRoles = TRANSITION_ROLES[from]?.[to];
  const requiredPermission = TRANSITION_PERMISSIONS[from]?.[to];

  if (allowedRoles || requiredPermission) {
    const hasRole = (userRoles ?? []).some((role) => allowedRoles?.includes(role));
    // 권한 경로: 커스텀 역할이 역할 목록에 없어도 권한만 있으면 통과한다.
    // 엣지당 허용 권한은 배열이다(현재는 전부 1개). 여러 개를 둘 때는 OR 로 결합되므로,
    // 넓은 권한 하나를 끼워 넣으면 TRANSITION_ROLES 의 제외가 통째로 무력화된다.
    const hasPermission =
      !!requiredPermission?.length &&
      (userPermissions ?? []).some((p) => requiredPermission.includes(p.toUpperCase()));

    if (!hasRole && !hasPermission) {
      const needed = [
        allowedRoles?.length ? `역할: ${allowedRoles.join(', ')}` : null,
        requiredPermission?.length ? `권한: ${requiredPermission.join(' 또는 ')}` : null,
      ]
        .filter(Boolean)
        .join(' 또는 ');
      return {
        valid: false,
        message: `이 상태 변경을 수행할 권한이 없습니다. (필요 ${needed})`,
      };
    }
  }

  // 2-1. 고객 인수 게이트 — 확인 완료는 **신청자 본인만** 할 수 있다.
  //
  // 이 규칙은 원래 PATCH /api/srs/[id]/status 라우트 안에만 있었다. 그런데 상태는
  // PATCH /api/srs/[id] (srUpdateSchema 의 status 필드)로도 바꿀 수 있고, 그 경로는
  // 라우트의 검사를 타지 않는다. 실측 결과 ADMIN 과 **신청자가 아닌 CLIENT_ADMIN** 이
  // 그 경로로 남의 SR 을 CONFIRMED 로 종결시킬 수 있었다(상태 라우트는 403, 업데이트
  // 라우트는 200). 같은 규칙이 한 경로에만 있으면 반드시 이런 발산이 생긴다.
  //
  // 위의 역할/권한 표만으로는 막을 수 없다 — TRANSITION_ROLES 는 'CLIENT_USER' 라는
  // **역할**을 허용할 뿐 "그 SR 의 신청자인가"를 알지 못한다. 그래서 신원 검사를 여기
  // 공유 지점에 둔다. 두 라우트 모두 srService.updateSR 를 거치므로 함께 닫힌다.
  //
  // fail-closed 다: 신원을 확인할 수 없으면(currentData 나 actorId 가 없으면) 거부한다.
  // 예외(운영자가 등록한 SR 은 그 고객사의 CLIENT_ADMIN 도 확인)는 `canConfirmAsAcceptor` 가 판정한다.
  if (to === 'CONFIRMED') {
    const actor = { id: actorId, roles: userRoles, clientIds: actorClientIds };
    if (!canConfirmAsAcceptor(actor, currentData)) {
      return {
        valid: false,
        message: '신청자만 확인할 수 있습니다.',
      };
    }
  }

  // 2-2. 한 번 완료된 SR 은 거절로 끝내지 않는다(2026-09-18 소유자 결정 D9). 재오픈 → 보류 → 거절로 끝내면
  // 그 SR 이 준수율 표본에서 영구히 빠져 '재작업은 서비스 실패로 계상'(헌법 §2)이 무력화된다.
  // 판정 재료 `wasCompleted` 는 서버가 상태 이력으로 계산해 넘긴다(sr.service.wasEverCompleted).
  if (to === 'REJECTED' && isRejectBlockedAfterCompletion(currentData)) {
    return { valid: false, message: SR_REJECT_AFTER_COMPLETION_MESSAGE };
  }

  // 3. 필수 필드 데이터 검증
  const requiredFields = getRequiredFields(to);
  if (requiredFields.length > 0 && currentData && updateData) {
    const missingFields: string[] = [];

    for (const field of requiredFields) {
      // assigneeId는 특별 케이스 (assignedToId라는 별칭 사용 가능성)
      if (field === 'assigneeId' && isReopenTransition(from, to)) {
        // 재오픈의 담당자 요건은 아래 4번의 getReopenBlock 이 화면과 같은 문구로 판정한다.
        // 여기서 먼저 걸면 같은 SR 에 대해 서버와 화면이 서로 다른 이유를 말하게 된다.
        continue;
      } else if (field === 'assigneeId') {
        if (!updateData.assigneeId && !updateData.assignedToId && !currentData.assigneeId) {
          missingFields.push('담당자(assigneeId)');
        }
      } else if (field === 'resolutionDescription') {
        if (!updateData.resolutionDescription && !currentData.resolutionDescription) {
          missingFields.push('해결 내용(resolutionDescription)');
        }
      } else if (field === 'rejectionReason') {
        if (!updateData.rejectionReason && !currentData.rejectionReason) {
          missingFields.push('거절 사유(rejectionReason)');
        }
      } else if (field === 'expectedHoldReleaseDate') {
        // 다른 필드와 달리 currentData 로 폴백하지 않는다. 보류 해제 후 다시 보류할 때
        // 지난번 약속 날짜가 남아 있어 통과해 버리면 "이번 보류의 예상 해제일" 이 아니다.
        // 매 보류 전이마다 새로 받는다(해제 시 null 로 되돌린다).
        if (!updateData.expectedHoldReleaseDate) {
          missingFields.push('예상 해제일(expectedHoldReleaseDate)');
        }
      }
    }

    if (missingFields.length > 0) {
      return {
        valid: false,
        message: `${statusLabelOf(to)} 상태로 전환하려면 다음 필드가 필요합니다: ${missingFields.join(', ')}`,
      };
    }
  }

  // 4. 전이 맥락 규칙. 실제 쓰기 경로는 currentData/updateData 를 모두 넘긴다.
  // UI의 버튼 가시성 계산처럼 데이터 없이 호출하는 경우에는 흐름/인가만 판정한다.
  if (currentData && updateData) {
    const isReopen = isReopenTransition(from, to);
    const requiresReason = to === 'ON_HOLD' || isReopen;

    // 재오픈은 종결 후 7일까지만, 담당자가 있을 때만 허용한다. 이 규칙을 라우트가 아니라
    // 상태 머신에 두어 일반 서비스 호출에서도 동일하게 강제하고, 판정 자체는
    // `getReopenBlock` 하나에 맡겨 화면이 보여 주는 이유와 서버 거부 문구가 같게 한다.
    //
    // **기산점은 출발 상태를 따른다.** 예전에는 CONFIRMED 출발에도 `completedAt` 만 봤다.
    // 완료 6일 뒤에 고객이 확인하고 그 다음 날 재오픈하면, 확인한 지 하루밖에 안 됐는데도
    // 창이 닫혀 있었다. 확인완료에서 되돌리는 것은 확인 시점부터 세는 것이 맞다.
    //
    // **fail-closed 다.** 예전에는 `if (isReopen && currentData.completedAt)` 라서
    // 기산점이 NULL 이면 검사를 통째로 건너뛰고 통과했다 — `completedAt` 기록이 도입되기
    // 전에 완료된 SR 은 몇 년이 지나도 재오픈됐다. 시각을 모르면 거부한다.
    //
    // 사유 검사보다 먼저 본다 — 사유를 채워도 어차피 재오픈할 수 없는 SR 에
    // "사유를 입력해주세요" 를 먼저 말하면 사용자가 헛수고를 한다.
    if (isReopen) {
      const block = getReopenBlock(
        from,
        {
          completedAt: currentData.completedAt,
          confirmedAt: currentData.confirmedAt,
          // 3번의 필수 필드 검사와 같은 우선순위(요청 본문 → 별칭 → 현재 값)로 담당자를 본다.
          assigneeId: updateData.assigneeId || updateData.assignedToId || currentData.assigneeId,
        },
        Date.now()
      );
      if (block) {
        return { valid: false, message: block.message };
      }
    }

    if (requiresReason && !updateData.changeReason?.trim()) {
      return {
        valid: false,
        message: isReopen ? '재오픈 사유를 입력해주세요.' : '보류 사유를 입력해주세요.',
      };
    }
  }

  return { valid: true };
};
