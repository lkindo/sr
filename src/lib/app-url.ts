/**
 * 앱 URL 결정 유틸리티
 *
 * 환경 변수 의존성을 줄이기 위해 여러 소스에서 앱 URL을 결정합니다.
 * 우선순위:
 * 1. NEXT_PUBLIC_APP_URL 환경 변수
 * 2. 브라우저에서는 현재 접속한 Origin
 * 3. 운영 빌드(NODE_ENV=production)의 서버에서는 운영 기본 도메인
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

  // 2. 브라우저(클라이언트) 환경인 경우 현재 접속한 Origin 사용 (테스트 환경 제외)
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    return window.location.origin;
  }

  // 3. 운영 빌드면 기본 운영 도메인. Docker 이미지는 NODE_ENV=production 이다(Dockerfile).
  //    예전에는 process.env.VERCEL 도 봤지만 Vercel 은 채택되지 않았다(2026-09-19 제거 — 운영·스테이징 결과 동일).
  if (process.env.NODE_ENV === 'production') {
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
