import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createEmailVerificationToken,
  EMAIL_VERIFICATION_TTL_HOURS,
  getEmailVerificationUrl,
  readEmailVerificationToken,
} from '@/lib/email-verification';

/**
 * 가입 이메일 인증 토큰(2026-09-18 소유자 결정 D13 B+). 무상태 HMAC 서명이다 — 토큰 테이블이 없으므로
 * 위조·변조·만료를 서명과 만료 시각만으로 가려야 한다.
 */
const T0 = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const SECRET_KEYS = ['AUTH_SECRET', 'NEXTAUTH_SECRET'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of SECRET_KEYS) saved[key] = process.env[key];
  process.env.AUTH_SECRET = 'test-secret-for-email-verification-0123456789';
});

afterEach(() => {
  for (const key of SECRET_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('email-verification token', () => {
  it('유효 기간은 PRD 대로 24시간이다', () => {
    expect(EMAIL_VERIFICATION_TTL_HOURS).toBe(24);
  });

  it('만든 토큰을 읽으면 사용자 id 와 (소문자로 맞춘) 이메일이 나온다', () => {
    const token = createEmailVerificationToken('user-1', ' Hong@Example.com ', T0);

    expect(readEmailVerificationToken(token, T0 + HOUR)).toEqual({
      status: 'valid',
      userId: 'user-1',
      email: 'hong@example.com',
    });
  });

  it('24시간이 지나면 expired 다', () => {
    const token = createEmailVerificationToken('user-1', 'hong@example.com', T0);

    expect(readEmailVerificationToken(token, T0 + 24 * HOUR)).toEqual({ status: 'expired' });
  });

  it('내용을 바꾸면(다른 사용자 id 로 바꿔치기) 서명이 맞지 않아 invalid 다', () => {
    const token = createEmailVerificationToken('user-1', 'hong@example.com', T0);
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ u: 'admin-1', e: 'hong@example.com', x: T0 + 24 * HOUR })
    ).toString('base64url');

    expect(readEmailVerificationToken(`${forged}.${signature}`, T0)).toEqual({
      status: 'invalid',
    });
  });

  it('다른 시크릿으로 서명한 토큰은 invalid 다', () => {
    const token = createEmailVerificationToken('user-1', 'hong@example.com', T0);
    process.env.AUTH_SECRET = 'another-secret-another-secret-another-secret';

    expect(readEmailVerificationToken(token, T0)).toEqual({ status: 'invalid' });
  });

  it.each(['', 'abc', 'a.b.c', '.sig', 'payload.'])(
    '모양이 틀린 토큰(%j)은 invalid 다',
    (token) => {
      expect(readEmailVerificationToken(token, T0)).toEqual({ status: 'invalid' });
    }
  );

  it('서명은 맞아도 내용이 형식에 맞지 않으면 invalid 다', () => {
    // 서명 검증 뒤의 형식 검사까지 거치는지 본다 — 같은 규칙(용도 접두사 + HMAC-SHA256)으로 직접 서명한다.
    const signed = (data: unknown) => {
      const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
      const signature = createHmac('sha256', process.env.AUTH_SECRET!)
        .update(`sr-email-verification:v1.${payload}`)
        .digest('base64url');
      return `${payload}.${signature}`;
    };

    // 규칙이 같은지 먼저 확인한다(아니면 아래 단언이 서명 불일치로 통과해 버린다).
    expect(
      readEmailVerificationToken(signed({ u: 'user-1', e: 'a@b.c', x: T0 + HOUR }), T0)
    ).toMatchObject({
      status: 'valid',
    });
    expect(readEmailVerificationToken(signed({ u: 1, e: 'a@b.c', x: T0 + HOUR }), T0)).toEqual({
      status: 'invalid',
    });
    expect(readEmailVerificationToken(signed({ u: 'user-1', e: 'a@b.c' }), T0)).toEqual({
      status: 'invalid',
    });
    expect(readEmailVerificationToken(signed('just-a-string'), T0)).toEqual({ status: 'invalid' });
  });

  it('시크릿이 없으면 서명하지 않고 던진다', () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    expect(() => createEmailVerificationToken('user-1', 'hong@example.com', T0)).toThrow(
      /AUTH_SECRET/
    );
  });

  it('링크는 로그인 없이 여는 인증 API 를 가리키고 토큰을 인코딩한다', () => {
    const url = new URL(getEmailVerificationUrl('abc.def'));

    expect(url.pathname).toBe('/api/register/verify-email');
    expect(url.searchParams.get('token')).toBe('abc.def');
  });
});
