/**
 * 전역 상수 정의
 *
 * 이 파일은 애플리케이션 전반에서 사용되는 상수를 중앙 관리합니다.
 * Magic number를 명명된 상수로 추출하여 가독성과 유지보수성을 향상시킵니다.
 */

/**
 * 페이지네이션 관련 상수
 */
export const PAGINATION = {
  /**
   * 기본 페이지 크기
   */
  DEFAULT_PAGE_SIZE: 20,

  /**
   * 기본 조회 제한 (무한 스크롤 등)
   */
  DEFAULT_LIMIT: 20,

  /**
   * 최대 페이지 크기
   */
  MAX_PAGE_SIZE: 100,

  /**
   * 대시보드: 상위 고객사 수
   */
  DASHBOARD_TOP_CLIENTS: 10,

  /**
   * 대시보드: 최근 SR 수
   */
  DASHBOARD_RECENT_SRS: 10,

  /**
   * 대시보드: 접수 대기 SR 수
   */
  DASHBOARD_WAITING_SRS: 5,

  /**
   * 대시보드: 내 담당 SR 수
   */
  DASHBOARD_MY_ASSIGNED: 5,
} as const;

/**
 * 클라이언트 쿼리 캐시 관련 상수 (React Query)
 */
export const CLIENT_QUERY = {
  /**
   * 데이터 신선도 유지 시간 (1분)
   */
  STALE_TIME_MS: 60 * 1000,

  /**
   * 가비지 컬렉션 시간 (5분)
   */
  GC_TIME_MS: 5 * 60 * 1000,

  /**
   * 재시도 횟수
   */
  RETRY_COUNT: 1,
} as const;

/**
 * 통계 및 트렌드 관련 상수
 */
export const STATS = {
  /**
   * 트렌드 분석 기간 (일)
   */
  TREND_DAYS: 30,
} as const;

/**
 * 시간 단위 상수 (밀리초)
 */
export const TIME_MS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const;

/**
 * SLA 관련 상수
 */
export const SLA = {
  /**
   * 우선순위별 SLA 시간 배율
   * - CRITICAL: 기본 SLA의 50% (긴급)
   * - HIGH: 기본 SLA의 75%
   * - MEDIUM: 기본 SLA의 100% (기준)
   * - LOW: 기본 SLA의 150%
   */
  PRIORITY_MULTIPLIER: {
    CRITICAL: 0.5,
    HIGH: 0.75,
    MEDIUM: 1.0,
    LOW: 1.5,
  } as Record<string, number>,
} as const;

/**
 * 보안 관련 상수
 */
export const SECURITY = {
  /**
   * 비밀번호 해싱 워크 팩터 (Cost Factor)
   * - 12: 보안 강화 (기존 10보다 안전)
   */
  BCRYPT_WORK_FACTOR: 12,
} as const;
