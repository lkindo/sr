import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth';

export async function middleware(request: NextRequest) {
    // 1. 공용 라우트 (비로그인 접근 허용) - 정적 파일 포함
    const publicPaths = ['/login', '/register', '/api/auth', '/_next', '/favicon.ico', '/public'];
    const isPublicPath = publicPaths.some(path =>
        request.nextUrl.pathname.startsWith(path) ||
        request.nextUrl.pathname === '/'
    );

    if (isPublicPath) {
        return NextResponse.next();
    }

    // 2. 인증 확인
    const session = await auth();

    // 3. 비로그인 사용자 리다이렉트
    if (!session) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('callbackUrl', request.nextUrl.pathname);
        return NextResponse.redirect(url);
    }

    // 4. 로그인 사용자 로그인 페이지 접근 시 대시보드로 리다이렉트
    if (session && request.nextUrl.pathname === '/login') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes - handled by auth wrapper separately)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
