/**
 * 로그인 보강 회귀 테스트(2026-09-18 소유자 결정 D13).
 *
 * 이 스위트가 고정하는 계약:
 *   1. 한 계정(이메일)에 대한 실패는 IP 와 무관하게 세고, 한도에 닿으면 `account_locked` 로 거부한다.
 *      잠긴 동안은 비밀번호를 확인하지 않는다. 존재하지 않는 이메일도 똑같이 잠긴다.
 *   2. 로그인 성공·실패(존재하는 계정의 비밀번호 불일치)를 감사 로그에 남긴다. 감사 로그 쓰기가 실패해도
 *      로그인은 막지 않는다.
 *   3. 세션은 로그인한 지 12시간이 지나면 사용 중이어도 끝난다(절대 수명). 엣지 미들웨어의 jwt 콜백도
 *      같은 판정을 한다.
 *
 * `auth.session-revalidation.test.ts` 와 같은 방식으로 `NextAuth()` 에 전달되는 설정을 가로채
 * 실제 authorize·jwt 콜백을 실행한다.
 */
import type { NextAuthConfig } from 'next-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CapturedConfig = NextAuthConfig & {
  callbacks: NonNullable<NextAuthConfig['callbacks']>;
};

let capturedConfig: CapturedConfig | undefined;

vi.mock('next-auth', () => {
  class CredentialsSignin extends Error {
    code = 'credentials';
  }
  return {
    default: vi.fn((config: CapturedConfig) => {
      capturedConfig = config;
      return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
    }),
    CredentialsSignin,
  };
});

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn((options: unknown) => options),
}));

vi.mock('@/lib/prisma', () => ({
  default: { user: { findUnique: vi.fn() } },
}));

vi.mock('@/lib/security', () => ({
  verifyPassword: vi.fn(),
}));

vi.mock('@/services/audit.service', () => ({
  auditService: { createLog: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    logError: vi.fn(),
    logRequest: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { authConfig, SESSION_ABSOLUTE_MAX_AGE_SECONDS } from '@/auth.config';
import { resetLoginThrottleForTests } from '@/lib/login-throttle';
import prisma from '@/lib/prisma';
import { verifyPassword } from '@/lib/security';
import { auditService } from '@/services/audit.service';

const findUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const verify = verifyPassword as unknown as ReturnType<typeof vi.fn>;
const createLog = auditService.createLog as unknown as ReturnType<typeof vi.fn>;

const HOUR = 60 * 60 * 1000;
const ABSOLUTE_MS = SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000;

type TestToken = Record<string, unknown>;

function authorize(email: string, password = 'Secret#123') {
  const provider = capturedConfig?.providers?.[0] as
    { authorize: (credentials: unknown, request: Request) => Promise<unknown> } | undefined;
  if (!provider) throw new Error('authorize 를 가로채지 못했다 — mock 설정을 확인할 것');
  return provider.authorize(
    { email, password },
    new Request('http://localhost:3000/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'x-real-ip': '203.0.113.7' },
    })
  );
}

async function runJwt(args: {
  token: TestToken;
  user?: { id: string; email: string; name: string | null; image: string | null };
}): Promise<TestToken | null> {
  const jwt = capturedConfig?.callbacks?.jwt;
  if (!jwt) throw new Error('jwt 콜백을 가로채지 못했다 — mock 설정을 확인할 것');
  return (await (jwt as (a: unknown) => Promise<TestToken | null>)(args)) ?? null;
}

function dbUser(overrides: Partial<{ isActive: boolean }> = {}) {
  return {
    id: 'user-1',
    email: 'hong@example.com',
    name: '홍길동',
    image: null,
    password: 'hash',
    isActive: true,
    sessionVersion: 1,
    roles: [{ role: { name: 'ENGINEER' } }],
    clients: [],
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  resetLoginThrottleForTests();
  process.env.DATABASE_URL = 'postgresql://test/test';
  createLog.mockResolvedValue(undefined);
  if (!capturedConfig) {
    await import('@/auth');
  }
});

describe('authorize — 계정 단위 실패 잠금', () => {
  it('같은 계정이 10번 틀리면 11번째는 비밀번호를 확인하지 않고 account_locked 로 거부한다', async () => {
    findUnique.mockResolvedValue(dbUser());
    verify.mockResolvedValue(false);

    for (let i = 0; i < 10; i++) {
      expect(await authorize('hong@example.com', 'wrong')).toBeNull();
    }
    findUnique.mockClear();
    verify.mockClear();

    // 맞는 비밀번호여도 잠긴 동안은 거부한다 — 대입 공격이 맞는 값을 찾아도 쓸 수 없다.
    verify.mockResolvedValue(true);
    await expect(authorize('hong@example.com')).rejects.toMatchObject({ code: 'account_locked' });
    expect(findUnique).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('존재하지 않는 이메일도 똑같이 잠긴다 — 잠금 여부로 계정 존재를 알아낼 수 없다', async () => {
    findUnique.mockResolvedValue(null);
    verify.mockResolvedValue(false);

    for (let i = 0; i < 10; i++) {
      expect(await authorize('nobody@example.com', 'wrong')).toBeNull();
    }

    await expect(authorize('nobody@example.com', 'wrong')).rejects.toMatchObject({
      code: 'account_locked',
    });
    // 존재하지 않는 이메일은 감사 로그에 남기지 않는다 — 공격자가 입력한 값이 DB 에 쌓이지 않게 한다.
    expect(createLog).not.toHaveBeenCalled();
  });

  it('성공하면 실패 기록을 지운다 — 9번 틀린 뒤 성공했다면 다시 10번을 새로 센다', async () => {
    findUnique.mockResolvedValue(dbUser());
    verify.mockResolvedValue(false);
    for (let i = 0; i < 9; i++) await authorize('hong@example.com', 'wrong');

    verify.mockResolvedValue(true);
    expect(await authorize('hong@example.com')).toMatchObject({ id: 'user-1' });

    verify.mockResolvedValue(false);
    expect(await authorize('hong@example.com', 'wrong')).toBeNull();
    verify.mockResolvedValue(true);
    expect(await authorize('hong@example.com')).toMatchObject({ id: 'user-1' });
  });
});

describe('authorize — 로그인 기록(감사 로그)', () => {
  it('성공은 LOGIN 으로, 행위자·대상·IP 와 함께 남긴다', async () => {
    findUnique.mockResolvedValue(dbUser());
    verify.mockResolvedValue(true);

    await authorize('hong@example.com');

    expect(createLog).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      actionType: 'LOGIN',
      targetEntity: 'User',
      targetId: 'user-1',
      changes: {},
      ipAddress: '203.0.113.7',
    });
  });

  it('존재하는 계정의 비밀번호 불일치는 LOGIN_FAILED 로 남긴다 — 행위자는 비우고 대상에 계정을 둔다', async () => {
    findUnique.mockResolvedValue(dbUser());
    verify.mockResolvedValue(false);

    await authorize('hong@example.com', 'wrong');

    expect(createLog).toHaveBeenCalledWith(expect.anything(), {
      userId: null,
      actionType: 'LOGIN_FAILED',
      targetEntity: 'User',
      targetId: 'user-1',
      changes: { reason: 'invalid_password', lockedNow: false },
      ipAddress: '203.0.113.7',
    });
    // 입력한 비밀번호는 어디에도 남기지 않는다(be-rules §5).
    expect(JSON.stringify(createLog.mock.calls)).not.toContain('wrong');
  });

  it('잠금을 건 실패는 lockedNow 로 표시하고, 잠긴 뒤의 시도는 행을 늘리지 않는다', async () => {
    findUnique.mockResolvedValue(dbUser());
    verify.mockResolvedValue(false);

    for (let i = 0; i < 10; i++) await authorize('hong@example.com', 'wrong');
    await authorize('hong@example.com', 'wrong').catch(() => undefined);
    await authorize('hong@example.com', 'wrong').catch(() => undefined);

    expect(createLog).toHaveBeenCalledTimes(10);
    expect(createLog.mock.calls.at(-1)?.[1]).toMatchObject({
      changes: { reason: 'invalid_password', lockedNow: true },
    });
  });

  it('감사 로그 쓰기가 실패해도 로그인은 성공한다', async () => {
    findUnique.mockResolvedValue(dbUser());
    verify.mockResolvedValue(true);
    createLog.mockRejectedValue(new Error('db down'));

    expect(await authorize('hong@example.com')).toMatchObject({ id: 'user-1' });
  });

  it('비활성 계정은 맞는 비밀번호여도 거부하고 LOGIN 을 남기지 않는다', async () => {
    findUnique.mockResolvedValue(dbUser({ isActive: false }));
    verify.mockResolvedValue(true);

    expect(await authorize('hong@example.com')).toBeNull();
    expect(createLog).not.toHaveBeenCalled();
  });
});

describe('세션 절대 수명(12시간)', () => {
  it('정책 수치는 12시간이다', () => {
    expect(SESSION_ABSOLUTE_MAX_AGE_SECONDS).toBe(12 * 60 * 60);
  });

  it('로그인할 때 기준 시각(loginAt)을 싣는다', async () => {
    findUnique.mockResolvedValue(dbUser());
    const before = Date.now();

    const token = await runJwt({
      token: {},
      user: { id: 'user-1', email: 'hong@example.com', name: '홍길동', image: null },
    });

    expect(token?.loginAt).toBeGreaterThanOrEqual(before);
  });

  it('클레임 재조회 주기 안이어도(조기 반환 경로) 12시간이 지난 토큰은 버린다', async () => {
    const token = await runJwt({
      token: {
        id: 'user-1',
        roles: ['ENGINEER'],
        clientIds: [],
        checkedAt: Date.now(),
        loginAt: Date.now() - ABSOLUTE_MS - 1000,
      },
    });

    expect(token).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('12시간이 안 됐으면 사용 중인 세션을 유지한다', async () => {
    const loginAt = Date.now() - 11 * HOUR;
    const token = await runJwt({
      token: { id: 'user-1', roles: ['ENGINEER'], clientIds: [], checkedAt: Date.now(), loginAt },
    });

    expect(token?.loginAt).toBe(loginAt);
  });

  it('이 변경 전에 발급된 토큰(loginAt 없음)은 지금부터 센다 — 곧바로 로그아웃시키지 않는다', async () => {
    const before = Date.now();
    const token = await runJwt({
      token: { id: 'user-1', roles: ['ENGINEER'], clientIds: [], checkedAt: Date.now() },
    });

    expect(token).not.toBeNull();
    expect(token?.loginAt).toBeGreaterThanOrEqual(before);
  });

  it('엣지 미들웨어의 jwt 콜백도 12시간이 지난 토큰을 버린다', () => {
    const jwt = authConfig.callbacks.jwt as (a: { token: TestToken }) => TestToken | null;

    expect(jwt({ token: { id: 'user-1', loginAt: Date.now() - ABSOLUTE_MS - 1000 } })).toBeNull();
    const fresh = { id: 'user-1', loginAt: Date.now() - HOUR };
    expect(jwt({ token: fresh })).toBe(fresh);
    // 기준 시각이 없는 옛 토큰은 버리지 않고 지금 시각을 싣는다 — 미들웨어가 쿠키를 다시 발급하므로 저장된다.
    const before = Date.now();
    const legacy = jwt({ token: { id: 'user-1' } });
    expect(legacy?.loginAt).toBeGreaterThanOrEqual(before);
  });
});
