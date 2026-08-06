/**
 * SR 상태 전환 규칙 (State Machine)
 *
 * 백엔드 SRService의 validateTransition과 동일한 규칙을 적용합니다.
 */

export type SRStatus =
  | 'REQUESTED'
  | 'INTAKE'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'REJECTED';

/**
 * 각 상태에서 전환 가능한 다음 상태들
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
    INTAKE: ['ADMIN', 'MANAGER', 'ENGINEER'],
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
    // 확인은 고객 인수 게이트다. 운영자(MANAGER/ENGINEER)는 대신 확인할 수 없다.
    CONFIRMED: ['ADMIN', 'CLIENT_USER', 'CLIENT_ADMIN'],
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
 * @returns 가능 여부와 메시지
 */
export const validateTransition = (
  from: SRStatus,
  to: SRStatus,
  userRoles?: string[],
  currentData?: any,
  updateData?: any,
  userPermissions?: string[]
): { valid: boolean; message?: string } => {
  // 1. 상태 흐름 유효성 검사
  if (!canTransition(from, to)) {
    return {
      valid: false,
      message: `${from}에서 ${to}(으)로 직접 전환할 수 없습니다.`,
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

  // 3. 필수 필드 데이터 검증
  const requiredFields = getRequiredFields(to);
  if (requiredFields.length > 0 && currentData && updateData) {
    const missingFields: string[] = [];

    for (const field of requiredFields) {
      // assigneeId는 특별 케이스 (assignedToId라는 별칭 사용 가능성)
      if (field === 'assigneeId') {
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
      }
    }

    if (missingFields.length > 0) {
      return {
        valid: false,
        message: `${to} 상태로 전환하려면 다음 필드가 필요합니다: ${missingFields.join(', ')}`,
      };
    }
  }

  return { valid: true };
};
