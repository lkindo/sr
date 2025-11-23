/**
 * SR 상태 전환 규칙 (State Machine)
 * 
 * 백엔드 SRService의 validateTransition과 동일한 규칙을 적용합니다.
 */

export type SRStatus =
    | "REQUESTED"
    | "INTAKE"
    | "IN_PROGRESS"
    | "ON_HOLD"
    | "COMPLETED"
    | "CONFIRMED"
    | "REJECTED";

/**
 * 각 상태에서 전환 가능한 다음 상태들
 */
export const VALID_TRANSITIONS: Record<SRStatus, SRStatus[]> = {
    REQUESTED: ["INTAKE", "REJECTED"],
    INTAKE: ["IN_PROGRESS", "ON_HOLD", "REJECTED"],
    IN_PROGRESS: ["COMPLETED", "ON_HOLD"],
    ON_HOLD: ["IN_PROGRESS", "REJECTED"],
    COMPLETED: ["CONFIRMED", "IN_PROGRESS"], // IN_PROGRESS for Reopen
    CONFIRMED: [], // Terminal state
    REJECTED: ["REQUESTED"], // Re-request
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
    IN_PROGRESS: ["assigneeId"],
    COMPLETED: ["resolutionDescription"],
    REJECTED: ["rejectionReason"],
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
 * 상태 전환 가능 여부와 사유를 함께 반환
 * @param from 현재 상태
 * @param to 목표 상태
 * @returns 가능 여부와 메시지
 */
export const validateTransition = (
    from: SRStatus,
    to: SRStatus
): { valid: boolean; message?: string } => {
    if (!canTransition(from, to)) {
        return {
            valid: false,
            message: `${from}에서 ${to}(으)로 직접 전환할 수 없습니다.`,
        };
    }

    const requiredFields = getRequiredFields(to);
    if (requiredFields.length > 0) {
        return {
            valid: true,
            message: `필수 입력: ${requiredFields.join(", ")}`,
        };
    }

    return { valid: true };
};
