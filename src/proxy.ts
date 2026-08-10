import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';

import { authConfig, isAuthPagePath } from '@/auth.config';

// Edge-safe한 auth 설정만 사용하여 Edge Function 크기 제한 준수
// bcryptjs, Prisma 등 Node.js 전용 의존성을 번들에서 제외
const { auth } = NextAuth(authConfig);

// Rate Limiter 인스턴스 (메모리 유지 - 람다/엣지에서는 인스턴스마다 별도일 수 있음)
import { getClientIdentifier, rateLimiters } from '@/lib/rate-limiter';
const ratelimit = rateLimiters.middleware;

export default auth(async (req) => {
  // Next.js 내부 요청 및 static 자산은 미들웨어 로직을 건너뜀 (더블 슬래시 static chunk 로드 버그 방지)
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');

  /**
   * 확장자 기반 skip 은 **`/api/` 밖에서만** 적용한다.
   *
   * 예전에는 확장자만 보고 조기 반환했다. 그래서 `/api/files/report.json` 처럼 확장자로
   * 끝나는 API 경로가 아래 레이트리밋을 **아예 타지 않았다.** 인가는 하위 `withAuth` 가
   * 하므로 인증 우회는 아니었지만, `.json` 을 붙이는 것만으로 미들웨어 레이트리밋 예산을
   * 무제한으로 쓸 수 있었다.
   *
   * `/_next/` 와 `/static/` 접두사는 `/api/` 와 겹칠 수 없으므로 그대로 둔다 —
   * skip 의 원래 목적(더블 슬래시 static chunk 로드 버그 방지)은 이 두 접두사와
   * 앱 정적 자산의 확장자 매칭으로 유지된다.
   */
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    (!isApiRoute && /\.(js|css|png|jpg|jpeg|gif|ico|svg|json|wasm)$/.test(pathname))
  ) {
    return NextResponse.next();
  }

  // 1. API 라우트 및 Server Actions Rate Limiting
  const isServerAction = req.method === 'POST' && req.headers.has('next-action');

  if (isApiRoute || isServerAction) {
    // 신뢰 프록시 기반 IP 해석 (조작 가능한 XFF 첫 항목 사용 금지)
    const ip = getClientIdentifier(req);
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
  // 판정은 `auth.config.ts` 의 단일 출처를 쓴다. 여기서 별도 구현을 갖고 있으면
  // authorized() 콜백과 미들웨어가 서로 다른 경로를 "인증 페이지"로 볼 수 있다.
  const isAuthPage = isAuthPagePath(pathname);
  const isRootPath = pathname === '/';

  // 보호된 경로(API 제외)에 대해 명시적 리다이렉트 처리 (Edge-safe)
  const isProtectedPath = !isAuthPage && !isRootPath && !isApiRoute;

  if (!isLoggedIn && isProtectedPath) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  // 로그인하지 않은 상태에서 루트(/) 접근 시도 시 로그인 페이지로 안내 (선택적 정책)
  if (!isLoggedIn && isRootPath) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  // 3. CSP (Content Security Policy) 적용
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  /**
   * `script-src` 에서 `'unsafe-inline'` 을 제거했다(감사 4.1).
   *
   * **왜 지금 안전한가.** Next.js 는 이 미들웨어가 내보내는 CSP 헤더에서 nonce 를 파싱해
   * (`app-render` 의 `getScriptNonceFromHeader`) 자기가 렌더링하는 모든 부트스트랩·
   * 하이드레이션 인라인 스크립트에 그 nonce 를 붙인다. 실측으로 확인했다 —
   * `/login` 의 `<script>` 20개 전부가 CSP 헤더와 **동일한** nonce 를 갖는다.
   * 앱 코드에는 직접 작성한 인라인 스크립트도 `next/script` 사용처도 없다.
   *
   * 감사는 "nonce 가 x-nonce 헤더에만 놓이고 어떤 script 태그에도 적용되지 않는다"고
   * 기술했으나, 실행해 보면 그렇지 않다. 다만 `'unsafe-inline'` 이 정책에 남아 있던 것은
   * 사실이고, 그것을 지우는 것이 이 변경이다.
   *
   * **그럼 무엇이 달라지는가.** CSP Level 2+ 브라우저는 nonce 가 있으면
   * `'unsafe-inline'` 을 무시하므로 최신 브라우저의 실효 정책은 이미 nonce 기반이었다.
   * 남겨 두면 (a) CSP1 만 아는 구형 브라우저에서 임의 인라인 스크립트가 실행되고,
   * (b) 정책을 읽는 사람에게 "인라인이 허용된다"고 잘못 알린다. 둘 다 지울 이유다.
   *
   * `style-src` 의 `'unsafe-inline'` 은 **의도적으로 남긴다.** React 가 렌더링하는
   * `style=` 속성이 실재하고(글로벌 에러 페이지 포함), 스타일 주입은 스크립트 주입과
   * 심각도가 다르다. 이걸 지우려면 `style-src-attr` 분리와 인라인 스타일 제거가 선행돼야
   * 하며, 그건 별도 작업이다.
   */
  const isDev = process.env.NODE_ENV === 'development';
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' ${isDev ? "'unsafe-eval'" : ''};
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
