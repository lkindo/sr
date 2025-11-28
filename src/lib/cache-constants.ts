/**
 * 캐시 키 및 TTL 상수 정의
 *
 * 이 파일은 Redis 캐싱에 사용되는 키 패턴과 TTL(Time To Live)을 중앙 관리합니다.
 */

/**
 * 캐시 키 생성 함수
 *
 * 일관된 키 네이밍 패턴을 제공합니다.
 */
export const CACHE_KEYS = {
    /**
     * Dashboard 통계 캐시 키
     * 
     * @param userId - 사용자 ID (선택사항, 없으면 전체 통계)
     * @returns 캐시 키
     */
    DASHBOARD_STATS: (userId?: string) =>
        userId ? `dashboard:stats:${userId}` : 'dashboard:stats',

    /**
     * 사용자 권한 캐시 키
     * 
     * @param userId - 사용자 ID
     * @returns 캐시 키
     */
    USER_PERMISSIONS: (userId: string) => `user:${userId}:permissions`,

    /**
     * 사용자 역할 캐시 키
     * 
     * @param userId - 사용자 ID
     * @returns 캐시 키
     */
    USER_ROLES: (userId: string) => `user:${userId}:roles`,

    /**
     * 사용자 전체 정보 캐시 키
     * 
     * @param userId - 사용자 ID
     * @returns 캐시 키
     */
    USER_FULL: (userId: string) => `user:full:${userId}`,

    /**
     * 고객사 목록 캐시 키
     * 
     * @returns 캐시 키
     */
    CLIENT_LIST: () => 'clients:list',

    /**
     * SR 상세 정보 캐시 키
     * 
     * @param srId - SR ID
     * @returns 캐시 키
     */
    SR_DETAILS: (srId: string) => `sr:${srId}:details`,

    /**
     * SR 목록 캐시 키 (필터별)
     * 
     * @param filterHash - 필터 조건의 해시값
     * @returns 캐시 키
     */
    SR_LIST: (filterHash: string) => `sr:list:${filterHash}`,

    /**
     * 역할 목록 캐시 키
     * 
     * @returns 캐시 키
     */
    ROLE_LIST: () => 'role:list',

    /**
     * 서비스 카테고리 목록 캐시 키
     * 
     * @returns 캐시 키
     */
    SERVICE_CATEGORY_LIST: () => 'service-category:list',
} as const;

/**
 * 캐시 TTL (Time To Live) 상수
 *
 * 단위: 초(seconds)
 */
export const CACHE_TTL = {
    /**
     * Dashboard 통계 - 5분
     * 
     * 빈번하게 변경되지만 실시간일 필요는 없음
     */
    DASHBOARD_STATS: 300,

    /**
     * 사용자 권한 - 10분
     * 
     * 권한 변경은 자주 일어나지 않음
     */
    USER_PERMISSIONS: 600,

    /**
     * 사용자 역할 - 10분
     * 
     * 역할 변경은 자주 일어나지 않음
     */
    USER_ROLES: 600,

    /**
     * 사용자 전체 정보 - 10분
     * 
     * 사용자 정보 변경은 자주 일어나지 않음
     */
    USER_FULL: 600,

    /**
     * 고객사 목록 - 30분
     * 
     * 고객사 정보는 거의 변경되지 않음
     */
    CLIENT_LIST: 1800,

    /**
     * SR 상세 정보 - 3분
     * 
     * SR은 자주 업데이트될 수 있으므로 짧은 TTL
     */
    SR_DETAILS: 180,

    /**
     * SR 목록 - 5분
     * 
     * 목록은 상세보다 덜 중요하므로 조금 더 긴 TTL
     */
    SR_LIST: 300,

    /**
     * 역할 목록 - 1시간
     * 
     * 역할은 거의 변경되지 않음
     */
    ROLE_LIST: 3600,

    /**
     * 서비스 카테고리 목록 - 1시간
     * 
     * 서비스 카테고리는 거의 변경되지 않음
     */
    SERVICE_CATEGORY_LIST: 3600,

    /**
     * 기본 TTL - 5분
     */
    DEFAULT: 300,
} as const;

/**
 * 캐시 무효화 패턴
 * 
 * 특정 리소스가 변경되었을 때 무효화해야 할 캐시 패턴들
 */
export const CACHE_INVALIDATION_PATTERNS = {
    /**
     * SR 변경 시 무효화할 패턴
     */
    SR_CHANGED: (srId: string) => [
        CACHE_KEYS.SR_DETAILS(srId),
        'sr:list:*',
        'dashboard:stats*',
    ],

    /**
     * 사용자 변경 시 무효화할 패턴
     */
    USER_CHANGED: (userId: string) => [
        CACHE_KEYS.USER_FULL(userId),
        CACHE_KEYS.USER_PERMISSIONS(userId),
        CACHE_KEYS.USER_ROLES(userId),
        'user:list*',
    ],

    /**
     * 역할 변경 시 무효화할 패턴
     */
    ROLE_CHANGED: () => [
        'user:permissions:*',
        'user:roles:*',
        'user:full:*',
        CACHE_KEYS.ROLE_LIST(),
    ],

    /**
     * 고객사 변경 시 무효화할 패턴
     */
    CLIENT_CHANGED: () => [
        CACHE_KEYS.CLIENT_LIST(),
        'user:full:*',
        'sr:list:*',
    ],
} as const;
