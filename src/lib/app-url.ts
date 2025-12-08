/**
 * 앱 URL 결정 유틸리티
 * 
 * 환경 변수 의존성을 줄이기 위해 여러 소스에서 앱 URL을 결정합니다.
 * 우선순위:
 * 1. NEXT_PUBLIC_APP_URL 환경 변수
 * 2. Vercel 시스템 변수 (VERCEL_URL)
 * 3. 프로덕션 기본값
 * 4. 로컬 기본값
 */

// 프로덕션 기본 URL (환경 변수가 없을 때 사용)
const PRODUCTION_DEFAULT_URL = 'https://www.lkindo.kr';
const LOCAL_DEFAULT_URL = 'http://localhost:3000';

/**
 * 앱의 기본 URL을 반환합니다.
 */
export function getAppUrl(): string {
    // 1. 환경 변수 우선
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL.replace(/["'`]/g, '').trim();
    }

    // 2. Vercel 시스템 변수 (Vercel 배포 시 자동 제공)
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }

    // 3. 프로덕션 환경이면 기본 프로덕션 URL
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        return PRODUCTION_DEFAULT_URL;
    }

    // 4. 로컬 기본값
    return LOCAL_DEFAULT_URL;
}

/**
 * SR 상세 페이지 URL을 반환합니다.
 */
export function getSRUrl(srId: string): string {
    return `${getAppUrl()}/srs/${srId}`;
}
