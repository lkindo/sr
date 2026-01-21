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

  // 2. 인증 처리 (기본 auth 미들웨어 동작)
  // return NextResponse.next(); // auth wrapper가 자동으로 처리함
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes - handled by auth wrapper separately)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)', // api 경로도 미들웨어 타도록 수정
  ],
};
