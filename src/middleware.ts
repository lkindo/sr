import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';

import { authConfig } from '@/auth.config';

// Edge-safe한 auth 설정만 사용하여 Edge Function 크기 제한 준수
// bcryptjs, Prisma 등 Node.js 전용 의존성을 번들에서 제외
const { auth } = NextAuth(authConfig);

// Rate Limiter 인스턴스 (메모리 유지 - 람다/엣지에서는 인스턴스마다 별도일 수 있음)
import { rateLimiters } from '@/lib/rate-limiter';
const ratelimit = rateLimiters.middleware;

export default auth(async (req) => {
  // 1. API 라우트 및 Server Actions Rate Limiting
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/');
  const isServerAction = req.method === 'POST' && req.headers.has('next-action');

  if (isApiRoute || isServerAction) {
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

  // 3. CSP (Content Security Policy) 적용
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // NOTE: In development mode, Next.js requires 'unsafe-eval' for HMR.
  // In production, we omit it for better security.
  const isDev = process.env.NODE_ENV === 'development';
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'nonce-${nonce}' ${isDev ? "'unsafe-eval'" : ''};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self' data:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    block-all-mixed-content;
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 요청 헤더에 x-nonce 추가 (내부용)
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // 응답 헤더에도 CSP 세팅
  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('x-nonce', nonce);

  return response;
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
