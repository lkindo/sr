/**
 * SR 관련 공통 상수 정의
 */

// SR 상태 라벨
export const statusLabels: Record<string, string> = {
  REQUESTED: '요청됨',
  INTAKE: '접수',
  IN_PROGRESS: '진행중',
  ON_HOLD: '대기',
  COMPLETED: '완료',
  CONFIRMED: '확인완료',
  REJECTED: '거부',
};

// SR 우선순위 라벨
export const priorityLabels: Record<string, string> = {
  CRITICAL: '긴급',
  HIGH: '높음',
  MEDIUM: '보통',
  LOW: '낮음',
};
