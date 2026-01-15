import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

// Edge-safe한 auth 설정만 사용하여 Edge Function 크기 제한 준수
// bcryptjs, Prisma 등 Node.js 전용 의존성을 번들에서 제외
const { auth } = NextAuth(authConfig);

export default auth;

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
