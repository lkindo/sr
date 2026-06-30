import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { auth } from '@/auth';

import { withAuth, withAuthAndRateLimit, withErrorHandler } from '../auth-wrapper';
import { NotFoundError, UnauthorizedError } from '../errors';

// Mock the NextAuth `auth()` function so we control the session.
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// Keep logger quiet (handleApiError logs via logger).
vi.mock('@/lib/logger', () => ({
  logger: {
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
    mockedAuth.mockResolvedValue(fullSession as any);

    const handler = vi.fn(async (_req: NextRequest, ctx: any) => {
      return NextResponse.json({ userId: ctx.session.user.id, params: await ctx.params });
    });

    const wrapped = withAuth(handler);
    const req = makeRequest();
    const params = Promise.resolve({ id: 'abc' });

    const res = await wrapped(req, { params });

    expect(handler).toHaveBeenCalledTimes(1);
    const [passedReq, passedCtx] = handler.mock.calls[0];
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
    } as any);

    const handler = vi.fn(async (_req: NextRequest, ctx: any) =>
      NextResponse.json({ ok: true, user: ctx.session.user })
    );

    const wrapped = withAuth(handler);
    await wrapped(makeRequest(), { params: Promise.resolve({}) });

    const ctx = handler.mock.calls[0][1];
    expect(ctx.session.user.email).toBe('');
    expect(ctx.session.user.roles).toEqual([]);
    expect(ctx.session.user.permissions).toEqual([]);
    expect(ctx.session.user.clientIds).toEqual([]);
    expect(ctx.session.user.name).toBeUndefined();
    expect(ctx.session.user.image).toBeUndefined();
  });

  it('returns 401 and does not call handler when session is null', async () => {
    mockedAuth.mockResolvedValue(null as any);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const wrapped = withAuth(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
    // auth() is called once in try, once in catch
    expect(mockedAuth).toHaveBeenCalledTimes(2);
  });

  it('returns 401 when session exists but user.id is missing', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'noid@example.com' }, expires: 'x' } as any);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const wrapped = withAuth(handler);

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it('routes handler-thrown ServiceError through handleApiError', async () => {
    mockedAuth.mockResolvedValue(fullSession as any);

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
    mockedAuth.mockResolvedValue(fullSession as any);

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

  it('still produces an error response when the catch-block auth() also fails (userId undefined)', async () => {
    // First call (try) succeeds, handler throws; second call (catch) rejects.
    mockedAuth
      .mockResolvedValueOnce(fullSession as any)
      .mockRejectedValueOnce(new Error('auth down'));

    const handler = vi.fn(async () => {
      throw new UnauthorizedError();
    });
    const wrapped = withAuth(handler);

    // The catch block awaits auth() again; if it rejects the wrapper rejects.
    await expect(wrapped(makeRequest(), { params: Promise.resolve({}) })).rejects.toThrow(
      'auth down'
    );
  });
});

describe('withErrorHandler', () => {
  it('passes request and routeContext straight to the handler on success', async () => {
    const handler = vi.fn(async (_req: NextRequest, ctx: { params: any }) =>
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
    mockedAuth.mockResolvedValue(fullSession as any);

    const handler = vi.fn(async (_req: NextRequest, ctx: any) =>
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
    mockedAuth.mockResolvedValue(null as any);

    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const wrapped = withAuthAndRateLimit(handler, { preset: 'strict' });

    const res = await wrapped(makeRequest(), { params: Promise.resolve({}) });

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });
});
