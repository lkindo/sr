import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';

import { authConfig } from '@/auth.config';
import { MemoryRateLimiter } from '@/lib/rate-limiter';

// Edge-safe한 auth 설정만 사용하여 Edge Function 크기 제한 준수
// bcryptjs, Prisma 등 Node.js 전용 의존성을 번들에서 제외
const { auth } = NextAuth(authConfig);

// Rate Limiter 인스턴스 (메모리 유지 - 람다/엣지에서는 인스턴스마다 별도일 수 있음)
import { rateLimiters } from '@/lib/rate-limiter';
const ratelimit = rateLimiters.middleware;

export default auth(async (req) => {
  // 1. API 라우트 Rate Limiting
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1';
    const { allowed, limit, resetTime, remaining } = await ratelimit.check(ip);

    if (!allowed) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': resetTime.toString(),
        },
      });
    }
  }

  // 2. 인증 처리
  const isLoggedIn = !!req.auth?.user;
  const isAuthPage =
    req.nextUrl.pathname.startsWith('/login') || req.nextUrl.pathname.startsWith('/register');
  const isRootPath = req.nextUrl.pathname === '/';

  // 보호된 경로(API 제외)에 대해 명시적 리다이렉트 처리 (Edge-safe)
  const isProtectedPath = !isAuthPage && !isRootPath && !req.nextUrl.pathname.startsWith('/api/');

  if (!isLoggedIn && isProtectedPath) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  // 로그인하지 않은 상태에서 루트(/) 접근 시도 시 로그인 페이지로 안내 (선택적 정책)
  if (!isLoggedIn && isRootPath) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest.json, sw.js (root static files)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:png|jpg|jpeg|gif|svg|webp)$).*)',
  ],
};
