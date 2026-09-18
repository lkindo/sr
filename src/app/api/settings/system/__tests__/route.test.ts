import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_MAX_AGE_SECONDS } from '@/auth.config';
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from '@/lib/constants/session';
import { PASSWORD_POLICY_DESCRIPTION } from '@/lib/schemas';

const state = vi.hoisted(() => ({ roles: ['ADMIN'] as string[] }));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit:
    (handler: (request: NextRequest, context: unknown) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(request, { session: { user: { id: 'admin-1', roles: state.roles } } }),
}));

import * as route from '../route';

/**
 * 시스템 설정 — **실제로 적용 중인 값을 보여 주는 읽기 전용 정보**.
 *
 * 예전 PUT 은 아무것도 저장하지 않으면서 "시스템 설정이 저장되었습니다" 를 돌려줬다. GET 은 앱
 * 어디에서도 읽지 않는 환경변수(SITE_NAME·SMTP_HOST·SESSION_TIMEOUT·PASSWORD_POLICY 등)와 가짜
 * 기본값(세션 24시간, "최소 6자", 마지막 백업 2025-01-12)을 돌려줬다 — 관리자가 보는 보안 정보가
 * 사실과 달랐다. 지금은 각 값의 정본(세션 상수, 비밀번호 스키마, 메일 발송 설정)에서 읽는다.
 */
const get = () => route.GET(new NextRequest('http://localhost/api/settings/system'), {} as never);

const ENV_KEYS = [
  'EMAIL_SERVER_HOST',
  'EMAIL_SERVER_PORT',
  'EMAIL_SERVER_USER',
  'EMAIL_SERVER_PASSWORD',
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  state.roles = ['ADMIN'];
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('GET /api/settings/system', () => {
  it('세션은 화면 유휴 로그아웃과 토큰 수명을 각 정본에서 읽어 준다', async () => {
    const body = await (await get()).json();

    expect(body.session).toEqual({
      idleLogoutMinutes: IDLE_TIMEOUT_MS / 60_000,
      idleWarningMinutes: IDLE_WARNING_MS / 60_000,
      tokenMaxAgeHours: SESSION_MAX_AGE_SECONDS / 3600,
    });
    // 정본 값 자체도 못박는다 — 사용자가 겪는 규칙은 "30분 무입력 → 로그아웃(1분 전 경고)" 이고
    // 8시간은 토큰 상한이다. 예전 화면은 8시간만 "세션" 으로 보여 줬다.
    expect(body.session).toEqual({
      idleLogoutMinutes: 30,
      idleWarningMinutes: 1,
      tokenMaxAgeHours: 8,
    });
    expect(body.passwordPolicy).toBe(PASSWORD_POLICY_DESCRIPTION);
  });

  it('메일 서버는 발송에 실제로 쓰는 EMAIL_SERVER_HOST/PORT 를 보여 준다', async () => {
    process.env.EMAIL_SERVER_HOST = 'mail.example.org';
    process.env.EMAIL_SERVER_PORT = '2525';
    process.env.EMAIL_SERVER_USER = 'mailer';
    process.env.EMAIL_SERVER_PASSWORD = 'mailer-secret-value';

    const body = await (await get()).json();

    expect(body.mailServer).toEqual({
      host: 'mail.example.org',
      port: 2525,
      configured: true,
      credentialsConfigured: true,
    });
    // 계정은 "있다" 만 알린다. 값은 응답 어디에도 실리지 않는다.
    expect(JSON.stringify(body)).not.toContain('mailer-secret-value');
    expect(JSON.stringify(body)).not.toContain('mailer');
  });

  it('메일 서버 환경변수가 없으면 발송이 쓰는 기본값과 함께 미설정임을 알린다', async () => {
    delete process.env.EMAIL_SERVER_HOST;
    delete process.env.EMAIL_SERVER_PORT;
    delete process.env.EMAIL_SERVER_USER;
    delete process.env.EMAIL_SERVER_PASSWORD;

    const body = await (await get()).json();

    expect(body.mailServer).toEqual({
      host: 'smtp.gmail.com',
      port: 587,
      configured: false,
      credentialsConfigured: false,
    });
  });

  it('발송 계정이 하나라도 빠지면 발송 불능임을 알린다 — sendMail 이 던지는 조건과 같다', async () => {
    process.env.EMAIL_SERVER_HOST = 'mail.example.org';
    process.env.EMAIL_SERVER_USER = 'mailer';
    delete process.env.EMAIL_SERVER_PASSWORD;

    const body = await (await get()).json();

    expect(body.mailServer.configured).toBe(true);
    expect(body.mailServer.credentialsConfigured).toBe(false);
  });

  it('앱에서 쓰지 않는 값은 싣지 않는다', async () => {
    const body = await (await get()).json();

    for (const key of [
      'siteName',
      'siteDescription',
      'adminEmail',
      'smtpHost',
      'sessionTimeout',
      'sessionIdleHours',
      'databaseBackupTime',
      'cacheStatus',
    ]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('ADMIN 이 아니면 거부한다', async () => {
    state.roles = ['MANAGER'];

    await expect(get()).rejects.toThrow('관리자 권한이 필요합니다.');
  });
});

describe('저장', () => {
  it('저장 엔드포인트가 없다 — 저장하지 않으면서 성공을 말하던 PUT 을 걷어냈다', () => {
    expect((route as Record<string, unknown>).PUT).toBeUndefined();
  });
});
