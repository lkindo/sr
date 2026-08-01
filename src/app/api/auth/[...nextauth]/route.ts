import { NextResponse } from 'next/server';

import { handlers } from '@/auth';
import { getClientIp, rateLimiters } from '@/lib/rate-limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 자격증명 로그인에 전용 strict 리미터를 건다.
 *
 * 예전에는 `export const { GET, POST } = handlers` 로 Auth.js 핸들러를 그대로 내보냈다.
 * 그래서 로그인 POST 가 미들웨어의 일반 버킷(분당 20~100회)만 거치고
 * `rateLimiters.strict`(분당 5회)는 **한 번도 통과하지 않았다**(감사 4.1).
 * 자격증명 스터핑에 사실상 열려 있었다는 뜻이다.
 *
 * 키는 `이메일 + IP` 다. IP 만 쓰면 NAT 뒤 사무실 전체가 한 예산을 공유해 정상 사용자가
 * 서로를 잠그고, 이메일만 쓰면 공격자가 IP 를 바꿔 가며 한 계정을 계속 두드릴 수 있다.
 *
 * 다른 Auth.js 엔드포인트(csrf, session, signout, providers)는 건드리지 않는다.
 * 그것들은 정상 사용 중에도 자주 호출되므로 strict 를 걸면 앱이 멈춘다.
 */
const CREDENTIALS_CALLBACK = '/api/auth/callback/credentials';

async function readEmail(request: Request): Promise<string> {
  try {
    // 원본 본문은 Auth.js 가 읽어야 하므로 복제본에서만 읽는다.
    const form = await request.clone().formData();
    const email = form.get('email');
    return typeof email === 'string' && email ? email.toLowerCase() : 'unknown';
  } catch {
    // 폼이 아니거나 파싱 불가한 본문. 이메일 없이 IP 로만 묶는다.
    return 'unknown';
  }
}

export const GET = handlers.GET;

export const POST = async (request: Request): Promise<Response> => {
  const { pathname } = new URL(request.url);

  if (pathname === CREDENTIALS_CALLBACK) {
    const email = await readEmail(request);
    const key = `login:${email}:${getClientIp(request.headers)}`;
    const result = await rateLimiters.strict.check(key);

    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests' },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil(result.resetTime / 1000).toString(),
            'X-RateLimit-Limit': result.limit.toString(),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }
  }

  return handlers.POST(request as never);
};
