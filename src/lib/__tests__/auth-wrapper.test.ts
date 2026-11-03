import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { auth } from '@/auth';

import { withAuth, withAuthAndRateLimit, withErrorHandler } from '../auth-wrapper';
import { NotFoundError, UnauthorizedError } from '../errors';
import { RateLimitPresets } from '../rate-limiter';

// Mock the NextAuth `auth()` function so we control the session.
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// Keep logger quiet (handleApiError logs via logger).
vi.mock('@/lib/logger', () => ({
  logger: {
    logRequest: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    logError: vi.fn(),
  },
}));

const mockedAuth = vi.mocked(auth);

function makeRequest(url = 'https://example.com/api/test', method = 'GET'): NextRequest {
  return new NextRequest(url, { method });
}

const fullSession = {
  user: {
    id: 'user-123',
    email: 'tester@example.com',
    name: 'Tester',
    image: 'https://img/avatar.png',
    roles: ['admin'],
    permissions: ['sr:read'],
    clientIds: ['client-1'],
  },
  expires: '2099-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withAuth', () => {
  it('invokes the handler with a fully-built AuthenticatedContext when authenticated', async () => {
    mockedAuth.mockResolvedValue(fullSession as never);

    const handler = vi.fn(async (_req: NextRequest, ctx) => {
      return NextResponse.json({ userId: ctx.session.user.id, params: await ctx.params });
    });

    const wrapped = withAuth(handler);
    const req = makeRequest();
    const params = Promise.resolve({ id: 'abc' });

    const res = await wrapped(req, { params });

    expect(handler).toHaveBeenCalledTimes(1);
    const [passedReq, passedCtx] = handler.mock.calls[0]!;
    expect(passedReq).toBe(req);
    // params are passed through untouched
    expect(passedCtx.params).toBe(params);
    // session normalized correctly
    expect(passedCtx.session.user).toMatchObject({
      id: 'user-123',
      email: 'tester@example.com',
      name: 'Tester',
      image: 'https://img/avatar.png',
      roles: ['admin'],
      permissions: ['sr:read'],
      clientIds: ['client-1'],
    });
    // top-level session fields are spread through
    expect(passedCtx.session.expires).toBe('2099-01-01T00:00:00.000Z');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-123');
  });

  it('fills defaults for missing optional session fields', async () => {
    mockedAuth.mockResolvedValue({
      user: { id: 'u-min' },
      expires: 'x',
    } as never);

    const handler = vi.fn(async (_req: NextRequest, ctx) =>
      NextResponse.json({ ok: true, user: ctx.session.user })
    );

    const wrapped = withAuth(handler);
    await wrapped(makeRequest(), { params: Promise.resolve({}) });

    const ctx = handler.mock.calls[0]![1];
    expect(ctx.session.user.email).toBe('');
    expect(ctx.session.user.roles).toEqual([]);
    expect(ctx.session.user.permissions).toEqual([]);
    expect(ctx.session.user.clientIds).toEqual([]);
    expect(ctx.session.user.name).toBeUndefined();
    expect(ctx.session.user.image).toBeUndefined();
  });

  it('returns 401 and does not call handler when session is null', async () => {
    mockedAuth.mockResolvedValue(null as never);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const wrapped = withAuth(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
    // auth() is called once in try; the catch reuses the already-resolved id (no second call)
    expect(mockedAuth).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when session exists but user.id is missing', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'noid@example.com' }, expires: 'x' } as never);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const wrapped = withAuth(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it('routes handler-thrown ServiceError through handleApiError', async () => {
    mockedAuth.mockResolvedValue(fullSession as never);

    const handler = vi.fn(async () => {
      throw new NotFoundError('SR', '42');
    });
    const wrapped = withAuth(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });

  it('routes generic handler errors as 500 INTERNAL_ERROR', async () => {
    mockedAuth.mockResolvedValue(fullSession as never);

    const handler = vi.fn(async () => {
      throw new Error('boom');
    });
    const wrapped = withAuth(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.error).toBe('boom');
  });

  it('reuses the resolved session in the catch block (does not call auth() a second time)', async () => {
    // auth() succeeds in the try block, then the handler throws.
    mockedAuth.mockResolvedValue(fullSession as never);

    const handler = vi.fn(async () => {
      throw new UnauthorizedError();
    });
    const wrapped = withAuth(handler);

    // Handler-thrown error is converted to a response (no rejection) and auth() ran only once.
    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    expect(mockedAuth).toHaveBeenCalledTimes(1);
  });
});

describe('withErrorHandler', () => {
  it('passes request and routeContext straight to the handler on success', async () => {
    const handler = vi.fn(async (_req: NextRequest, ctx: { params: unknown }) =>
      NextResponse.json({ params: await ctx.params })
    );
    const wrapped = withErrorHandler(handler);
    const req = makeRequest();
    const routeCtx = { params: Promise.resolve({ slug: 'home' }) };

    const res = await wrapped(req, routeCtx);

    expect(handler).toHaveBeenCalledWith(req, routeCtx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.params).toEqual({ slug: 'home' });
    // withErrorHandler must NOT call auth()
    expect(mockedAuth).not.toHaveBeenCalled();
  });

  it('converts thrown ServiceError to the matching HTTP status', async () => {
    const handler = vi.fn(async () => {
      throw new UnauthorizedError('nope');
    });
    const wrapped = withErrorHandler(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.error).toBe('nope');
  });

  it('converts a generic thrown Error to 500', async () => {
    const handler = vi.fn(async () => {
      throw new Error('explode');
    });
    const wrapped = withErrorHandler(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

describe('withAuthAndRateLimit', () => {
  it('uses the default standard preset and runs the authed handler', async () => {
    mockedAuth.mockResolvedValue(fullSession as never);

    const handler = vi.fn(async (_req: NextRequest, ctx) =>
      NextResponse.json({ userId: ctx.session.user.id })
    );

    const wrapped = withAuthAndRateLimit(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({ id: 'z' }) });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-123');
  });

  it('accepts an explicit preset and still enforces auth (401 when unauthenticated)', async () => {
    mockedAuth.mockResolvedValue(null as never);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const wrapped = withAuthAndRateLimit(handler, { preset: 'strict' });

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  /**
   * 실제 리미터를 쓴다. Auth.js 가 응답마다 세션 쿠키를 다시 발급하므로, 요청마다 쿠키가 달라도
   * 사용자 한도가 들어야 한다. 예전에는 쿠키 해시가 버킷 키라 정상 브라우저도 매번 새 버킷을 받았다.
   */
  describe('사용자별 한도', () => {
    const LIMIT = RateLimitPresets.STRICT.maxRequests;
    let sequence = 0;

    const sessionOf = (id: string) => ({ ...fullSession, user: { ...fullSession.user, id } });
    const requestWith = (cookieValue: string, path = '/api/srs/sr-1/comments') =>
      new NextRequest(`https://example.com${path}`, {
        method: 'POST',
        headers: {
          cookie: `__Secure-authjs.session-token=${cookieValue}`,
          // 다른 테스트와 천장을 나눠 쓰지 않게 IP 를 나눈다.
          'x-real-ip': `10.0.0.${sequence}`,
        },
      });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    beforeEach(() => {
      sequence += 1;
      handler.mockClear();
      // 테스트 환경의 우회를 끈다.
      vi.stubEnv('NODE_ENV', 'development');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('쿠키가 요청마다 달라도 같은 사용자면 한도에 걸린다', async () => {
      mockedAuth.mockResolvedValue(sessionOf(`rotating-${sequence}`) as never);
      const wrapped = withAuthAndRateLimit(handler, { preset: 'strict' });
      const params = { params: Promise.resolve({ id: 'sr-1' }) };

      for (let i = 0; i < LIMIT; i++) {
        const allowed = await wrapped(requestWith(`cookie-${i}`), params);
        expect(allowed.status).toBe(200);
      }
      const blocked = await wrapped(requestWith('cookie-next'), params);

      expect(blocked.status).toBe(429);
      expect(handler).toHaveBeenCalledTimes(LIMIT);
    });

    it('SR ID 를 바꿔도 한도를 넘을 수 없다', async () => {
      mockedAuth.mockResolvedValue(sessionOf(`id-rotating-${sequence}`) as never);
      const wrapped = withAuthAndRateLimit(handler, { preset: 'strict' });

      // 쿠키도 함께 바꾼다. 같은 쿠키면 예전의 쿠키 버킷에서도 통과해 ID 를 시험하지 못한다.
      for (let i = 0; i < LIMIT; i++) {
        const allowed = await wrapped(requestWith(`cookie-${i}`, `/api/srs/sr-${i}/comments`), {
          params: Promise.resolve({ id: `sr-${i}` }),
        });
        expect(allowed.status).toBe(200);
      }
      const blocked = await wrapped(requestWith('cookie-next', '/api/srs/sr-next/comments'), {
        params: Promise.resolve({ id: 'sr-next' }),
      });

      expect(blocked.status).toBe(429);
    });

    it('한 사람이 한도에 걸려도 같은 IP 의 다른 사람은 막히지 않는다', async () => {
      const wrapped = withAuthAndRateLimit(handler, { preset: 'strict' });
      const params = { params: Promise.resolve({ id: 'sr-1' }) };

      mockedAuth.mockResolvedValue(sessionOf(`busy-${sequence}`) as never);
      for (let i = 0; i < LIMIT; i++) await wrapped(requestWith('c'), params);
      expect((await wrapped(requestWith('c'), params)).status).toBe(429);

      mockedAuth.mockResolvedValue(sessionOf(`colleague-${sequence}`) as never);
      expect((await wrapped(requestWith('c'), params)).status).toBe(200);
    });

    it('인증에 실패한 요청은 예산을 쓰지 않는다', async () => {
      const userId = `after-login-${sequence}`;
      const wrapped = withAuthAndRateLimit(handler, { preset: 'strict' });
      const params = { params: Promise.resolve({ id: 'sr-1' }) };

      mockedAuth.mockResolvedValue(null as never);
      for (let i = 0; i < LIMIT + 1; i++) {
        expect((await wrapped(requestWith('c'), params)).status).toBe(401);
      }

      mockedAuth.mockResolvedValue(sessionOf(userId) as never);
      expect((await wrapped(requestWith('c'), params)).status).toBe(200);
    });
  });
});
