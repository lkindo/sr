import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getAppUrl } from '@/lib/app-url';

/**
 * 가입 이메일 인증 링크(2026-09-18 소유자 결정 D13 B+).
 *
 * 셀프 가입은 받은 이메일을 확인하지 않아, 누구나 실제 고객 담당자의 이메일로 가입 신청을 낼 수 있었다. 승인자
 * (운영자·고객사 관리자)는 그 신청이 진짜 그 사람인지 알 방법이 없었다. 가입할 때 인증 링크를 보내고, 링크를 연
 * 계정에 `users.email_verified` 를 기록해 승인 화면이 '이메일 미인증' 을 보이게 한다. **인증은 승인을 막지 않는다** —
 * 승인자가 판단하는 근거다.
 *
 * 토큰은 무상태다(토큰 테이블·마이그레이션 없음). `{사용자 id, 이메일, 만료 시각}` 을 인증 시크릿으로 HMAC 서명한다.
 *  - 이메일을 함께 서명하므로 이메일이 바뀐 뒤의 링크는 쓸 수 없다.
 *  - 한 번 인증되면 다시 열어도 기록이 바뀌지 않는다(PRD "1회 사용 후 만료" 의 실효).
 *  - 서명 입력에 용도 접두사를 붙여 같은 시크릿을 쓰는 다른 서명(세션 JWT)과 섞이지 않게 한다.
 */

/** 링크 유효 기간 — PRD 보안 §3 의 24시간. */
export const EMAIL_VERIFICATION_TTL_HOURS = 24;
const TTL_MS = EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000;
const PURPOSE = 'sr-email-verification:v1';

export type EmailVerificationToken =
  { status: 'valid'; userId: string; email: string } | { status: 'expired' | 'invalid' };

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      'AUTH_SECRET(또는 NEXTAUTH_SECRET)이 없어 이메일 인증 링크를 서명할 수 없습니다.'
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', signingSecret()).update(`${PURPOSE}.${payload}`).digest('base64url');
}

export function createEmailVerificationToken(
  userId: string,
  email: string,
  now = Date.now()
): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, e: email.trim().toLowerCase(), x: now + TTL_MS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readEmailVerificationToken(
  token: string,
  now = Date.now()
): EmailVerificationToken {
  const parts = token.split('.');
  const [payload, signature] = parts;
  if (parts.length !== 2 || !payload || !signature) return { status: 'invalid' };

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { status: 'invalid' };
  }

  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { status: 'invalid' };
  }
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as { u?: unknown }).u !== 'string' ||
    typeof (data as { e?: unknown }).e !== 'string' ||
    typeof (data as { x?: unknown }).x !== 'number'
  ) {
    return { status: 'invalid' };
  }
  const { u, e, x } = data as { u: string; e: string; x: number };
  if (x <= now) return { status: 'expired' };
  return { status: 'valid', userId: u, email: e };
}

/** 메일에 넣는 링크. 로그인 없이 여는 API 가 확인한 뒤 로그인 화면으로 돌려보낸다. */
export function getEmailVerificationUrl(token: string): string {
  return `${getAppUrl()}/api/register/verify-email?token=${encodeURIComponent(token)}`;
}
