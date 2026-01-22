import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  providers: [],
  session: {
    strategy: 'jwt',
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
