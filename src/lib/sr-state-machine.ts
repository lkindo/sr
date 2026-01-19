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
 * 상태 전이별 허용된 역할 정의
 * FromStatus -> ToStatus -> Allowed Roles
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
    CONFIRMED: ['ADMIN', 'CLIENT_USER', 'CLIENT_ADMIN'], // Requester confirms
    IN_PROGRESS: ['ADMIN', 'CLIENT_USER', 'CLIENT_ADMIN'], // Requester reopens
  },
  CONFIRMED: {
    IN_PROGRESS: ['ADMIN', 'CLIENT_USER', 'CLIENT_ADMIN'], // 7일 이내 재오픈
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
 * 상태 전환 가능 여부와 사유를 함께 반환 (권한 검증 포함)
 * @param from 현재 상태
 * @param to 목표 상태
 * @param userRoles 사용자 역할 목록 (Optional)
 * @returns 가능 여부와 메시지
 */
export const validateTransition = (
  from: SRStatus,
  to: SRStatus,
  userRoles?: string[]
): { valid: boolean; message?: string } => {
  // 1. 상태 흐름 유효성 검사
  if (!canTransition(from, to)) {
    return {
      valid: false,
      message: `${from}에서 ${to}(으)로 직접 전환할 수 없습니다.`,
    };
  }

  // 2. 역할 기반 권한 검사
  if (userRoles && userRoles.length > 0) {
    const allowedRoles = TRANSITION_ROLES[from]?.[to];
    if (allowedRoles) {
      const hasRole = userRoles.some((role) => allowedRoles.includes(role));
      if (!hasRole) {
        return {
          valid: false,
          message: `이 상태 변경을 수행할 권한이 없습니다. (필요 역할: ${allowedRoles.join(', ')})`,
        };
      }
    }
  }

  // 3. 필수 필드 검사는 Service 레벨에서 데이터 유무와 함께 수행하는 것이 더 적절할 수 있으나,
  // 여기서는 "필요하다"는 정보만 제공하거나, 호출자가 getRequiredFields를 사용하도록 유도.
  // 기존 로직 유지:
  const requiredFields = getRequiredFields(to);
  if (requiredFields.length > 0) {
    return {
      valid: true, // Transition itself is valid, but needs data. Service should check data.
      message: `필수 입력: ${requiredFields.join(', ')}`,
    };
  }

  return { valid: true };
};
