/**
 * 세션 재검증 회귀 테스트 (감사 4.1).
 *
 * 이 스위트가 고정하는 계약:
 *   1. 세션 수명이 Auth.js 기본값(30일)이 아니라 명시된 값이다.
 *   2. jwt 콜백이 60초 TTL 로 클레임을 DB 에서 다시 읽는다.
 *   3. 비활성화·삭제된 사용자의 토큰은 파기된다(`null` 반환).
 *   4. DB 조회 실패는 전원 로그아웃이 아니라 기존 클레임 유지로 처리된다.
 *
 * 기존 `auth.test.ts` 와 달리 **실제 콜백을 실행한다**. 그쪽은 콜백 로직을 테스트
 * 안에서 재구현해 단언하므로, 프로덕션 코드가 바뀌어도 계속 통과한다. 이 파일은
 * `NextAuth()` 에 전달되는 설정 객체를 가로채 그 안의 콜백을 직접 호출한다.
 */
import type { NextAuthConfig } from 'next-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CapturedConfig = NextAuthConfig & {
  callbacks: NonNullable<NextAuthConfig['callbacks']>;
  session: NonNullable<NextAuthConfig['session']>;
};

let capturedConfig: CapturedConfig | undefined;

vi.mock('next-auth', () => ({
  default: vi.fn((config: CapturedConfig) => {
    capturedConfig = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  }),
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn((options: unknown) => options),
}));

vi.mock('@/lib/prisma', () => ({
  default: { user: { findUnique: vi.fn() } },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

const findUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;

/** DB 가 돌려주는 형태 그대로. `loadUserClaims` 의 select 와 일치해야 의미가 있다. */
function dbUser(overrides: Partial<{ isActive: boolean }> = {}) {
  return {
    isActive: true,
    // 권한은 더 이상 이 쿼리가 읽지 않는다. 토큰에 담지 않기 때문이다
    // (lib/role-permissions.ts 가 세션 콜백에서 역할로부터 편다).
    roles: [{ role: { name: 'ADMIN' } }],
    clients: [{ clientId: 'client-1' }],
    ...overrides,
  };
}

/** 테스트가 다루는 최소 토큰. 실제 JWT 타입은 인덱스 시그니처를 갖는다. */
type TestToken = Record<string, unknown>;

async function runJwt(args: {
  token: TestToken;
  user?: { id: string; email: string; name: string | null; image: string | null };
  trigger?: 'signIn' | 'signUp' | 'update';
}): Promise<TestToken | null> {
  const jwt = capturedConfig?.callbacks?.jwt;
  if (!jwt) throw new Error('jwt 콜백을 가로채지 못했다 — mock 설정을 확인할 것');
  // Auth.js 의 콜백 파라미터는 유니온이라 테스트에서 전부 채우기 어렵다.
  // 이 스위트가 쓰는 필드만 전달한다.
  return (await (jwt as (a: unknown) => Promise<TestToken | null>)(args)) ?? null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = 'postgresql://test/test';
  if (!capturedConfig) {
    await import('@/auth');
  }
});

describe('세션 수명', () => {
  it('Auth.js 기본값(30일)이 아니라 명시된 maxAge 를 설정한다', async () => {
    const { authConfig } = await import('@/auth.config');

    expect(authConfig.session.strategy).toBe('jwt');
    expect(authConfig.session.maxAge).toBeDefined();

    const THIRTY_DAYS = 30 * 24 * 60 * 60;
    expect(authConfig.session.maxAge).toBeLessThan(THIRTY_DAYS);
    // 하루를 넘기면 "퇴근 후 방치된 세션이 다음 날까지 산다"는 문제가 되살아난다.
    expect(authConfig.session.maxAge).toBeLessThanOrEqual(24 * 60 * 60);
  });
});

describe('jwt 콜백 — 클레임 재조회', () => {
  it('최초 로그인 시 클레임을 채우고 checkedAt 을 기록한다', async () => {
    findUnique.mockResolvedValue(dbUser());

    const result = await runJwt({
      token: {},
      user: { id: 'user-1', email: 'a@b.com', name: 'A', image: null },
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('user-1');
    expect(result?.roles).toEqual(['ADMIN']);
    // 권한은 토큰에 없어야 한다 — 쿠키가 nginx 헤더 버퍼를 넘겨 로그인 사용자만
    // 502 를 받은 원인이었다(2026-08-08).
    expect(result?.permissions).toBeUndefined();
    expect(result?.clientIds).toEqual(['client-1']);
    expect(typeof result?.checkedAt).toBe('number');
  });

  it('TTL 이내에는 DB 를 다시 읽지 않는다', async () => {
    findUnique.mockResolvedValue(dbUser());

    const result = await runJwt({
      token: {
        id: 'user-1',
        roles: ['ADMIN'],
        permissions: ['SR:READ'],
        clientIds: ['client-1'],
        checkedAt: Date.now(),
      },
    });

    expect(findUnique).not.toHaveBeenCalled();
    expect(result?.roles).toEqual(['ADMIN']);
  });

  it('TTL 경과 후에는 DB 를 다시 읽어 회수된 역할을 반영한다', async () => {
    // 역할이 CLIENT_USER 로 강등된 상태를 DB 가 돌려준다.
    findUnique.mockResolvedValue({
      isActive: true,
      roles: [{ role: { name: 'CLIENT_USER' } }],
      clients: [],
    });

    const result = await runJwt({
      token: {
        id: 'user-1',
        roles: ['ADMIN'],
        permissions: ['SR:READ', 'SR:UPDATE'],
        clientIds: ['client-1'],
        checkedAt: Date.now() - 61_000, // 60초 TTL 초과
      },
    });

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(result?.roles).toEqual(['CLIENT_USER']);
    expect(result?.clientIds).toEqual([]);
  });

  it('checkedAt 이 없는 기존 토큰(배포 직전 발급분)도 즉시 재조회 대상이다', async () => {
    findUnique.mockResolvedValue(dbUser());

    await runJwt({ token: { id: 'user-1', roles: ['ADMIN'] } });

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("trigger === 'update' 는 TTL 과 무관하게 재조회한다", async () => {
    findUnique.mockResolvedValue(dbUser());

    await runJwt({
      token: { id: 'user-1', roles: ['ADMIN'], checkedAt: Date.now() },
      trigger: 'update',
    });

    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('jwt 콜백 — 세션 파기', () => {
  it('비활성화된 사용자의 토큰을 파기한다', async () => {
    findUnique.mockResolvedValue(dbUser({ isActive: false }));

    const result = await runJwt({
      token: { id: 'user-1', roles: ['ADMIN'], checkedAt: Date.now() - 61_000 },
    });

    // 이것이 이 수정의 핵심이다. 예전에는 비활성화해도 세션 수명이
    // 다할 때까지(기본 30일) ADMIN 으로 계속 통과했다.
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('삭제된 사용자의 토큰을 파기한다', async () => {
    findUnique.mockResolvedValue(null);

    const result = await runJwt({
      token: { id: 'user-1', roles: ['ADMIN'], checkedAt: Date.now() - 61_000 },
    });

    expect(result).toBeNull();
  });

  it('id 없는 토큰을 파기한다', async () => {
    const result = await runJwt({ token: { roles: ['ADMIN'] } });

    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('jwt 콜백 — DB 장애 처리', () => {
  it('주기 재조회 실패 시 기존 클레임을 유지한다(전원 로그아웃 방지)', async () => {
    findUnique.mockRejectedValue(new Error('connection refused'));

    const result = await runJwt({
      token: {
        id: 'user-1',
        roles: ['ADMIN'],
        permissions: ['SR:READ'],
        clientIds: ['client-1'],
        checkedAt: Date.now() - 61_000,
      },
    });

    expect(result).not.toBeNull();
    expect(result?.roles).toEqual(['ADMIN']);
    expect(logger.error).toHaveBeenCalled();
  });

  it('재조회에 실패하면 checkedAt 을 갱신하지 않아 다음 요청에서 다시 시도한다', async () => {
    findUnique.mockRejectedValue(new Error('connection refused'));

    const staleCheckedAt = Date.now() - 61_000;
    const result = await runJwt({
      token: { id: 'user-1', roles: ['ADMIN'], checkedAt: staleCheckedAt },
    });

    // checkedAt 이 갱신됐다면 장애가 지속되는 동안 재조회가 60초씩 밀린다.
    expect(result?.checkedAt).toBe(staleCheckedAt);
  });

  it('최초 로그인 중 조회에 실패하면 토큰을 발급하지 않는다', async () => {
    findUnique.mockRejectedValue(new Error('connection refused'));

    const result = await runJwt({
      token: {},
      user: { id: 'user-1', email: 'a@b.com', name: 'A', image: null },
    });

    // 클레임 없는 토큰은 어차피 모든 인가에 실패하므로, 로그인된 척하는 것보다
    // 로그인 실패가 정직하다.
    expect(result).toBeNull();
  });
});
