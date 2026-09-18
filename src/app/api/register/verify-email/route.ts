import { NextRequest, NextResponse } from 'next/server';

import { rateLimit } from '@/lib/api-rate-limit';
import { withErrorHandler } from '@/lib/auth-wrapper';
import { verifyEmailToken } from '@/services/email-verification.service';

// Prisma 를 쓰므로 Node.js 런타임에서 돈다.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 가입 이메일 인증 링크를 여는 곳(2026-09-18 소유자 결정 D13 B+).
 *
 * 메일의 링크를 누르는 사람은 로그인하지 않았을 수 있으므로(ENGINEER 가입자는 승인 전까지 비활성이다) 인증이
 * 없는 경로다. 서명된 토큰만 받고, 결과는 로그인 화면(`/login?verified=`)의 안내로 알린다. 응답에 계정 정보는
 * 싣지 않는다. 토큰을 대입해 볼 수 없도록 IP 당 strict(1분 5회)로 묶는다.
 *
 * 인증은 없지만 래퍼는 경유한다 — 오류 매핑·계측을 받는다(be-rules §1, LLD 'API 엔드포인트 카탈로그').
 * Location 은 상대 경로다 — 프록시 뒤에서 요청 URL 의 호스트가 내부 주소일 수 있다.
 */
export const GET = rateLimit(
  withErrorHandler(async (request: NextRequest) => {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const result = token ? await verifyEmailToken(token) : 'invalid';

    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: `/login?verified=${result}`,
        'Cache-Control': 'no-store',
        // 토큰이 담긴 이 URL 이 로그인 화면의 Referer 로 새지 않게 한다.
        'Referrer-Policy': 'no-referrer',
      },
    });
  }),
  'strict'
);
