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
   * 최대 페이지 번호. OFFSET 기반 조회가 비정상적으로 큰 값을 받아 DB를 오래
   * 스캔하지 않도록 모든 목록 진입점에서 같은 상한을 사용한다.
   */
  MAX_PAGE: 10_000,

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
 * 통계 및 트렌드 관련 상수
 */
export const STATS = {
  /**
   * 트렌드 분석 기간 (일)
   */
  TREND_DAYS: 30,
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
