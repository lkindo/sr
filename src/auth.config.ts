import type { NextAuthConfig } from 'next-auth';

/**
 * 세션 수명. Auth.js 기본값은 30일인데, 이 시스템에서는 그 값이 인가 통제를 무력화한다
 * (감사 4.1). 세션이 서명된 JWT 이고 서버 측 세션 레코드가 없으므로, 토큰 안의
 * roles/permissions/clientIds/활성여부는 **발급 시점의 스냅샷**이다. 30일이면
 * `DELETE /api/users/[id]`(소프트 비활성화)나 역할 회수가 최대 30일간 효력이 없다.
 *
 * 8시간으로 줄인 근거: 사내 업무 시스템이고 근무일 한 번의 로그인으로 하루가 덮인다.
 * 이보다 짧으면 업무 중 재로그인이 발생하고, 길면 퇴근 후 방치된 세션이 다음 날까지 산다.
 *
 * 이것만으로는 부족하다 — 8시간도 비활성화된 계정에게는 긴 시간이다. 그래서 `src/auth.ts`
 * 의 jwt 콜백이 60초 TTL 로 클레임을 재조회하고, 비활성/삭제 계정은 즉시 세션을 파기한다.
 * maxAge 는 그 TTL 검사를 빠져나간 경우의 **상한**이다.
 */
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export const authConfig = {
  providers: [],
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: '/login',
    signOut: '/',
    error: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage =
        nextUrl.pathname.startsWith('/login') || nextUrl.pathname.startsWith('/register');
      const isRootPath = nextUrl.pathname === '/';

      // 로그인하지 않은 상태에서 보호된 페이지 접근 시 로그인으로
      if (!isLoggedIn && !isAuthPage && !isRootPath) {
        return false;
      }

      // 로그인 상태에서 인증 페이지(/login, /register) 접근 시 대시보드로
      if (isLoggedIn && isAuthPage) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }

      // 로그인 상태에서 루트(/) 접근 시 대시보드로 즉시 리다이렉트
      if (isLoggedIn && isRootPath) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
