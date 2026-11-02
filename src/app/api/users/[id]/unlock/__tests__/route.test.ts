import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: { user: {} as Record<string, unknown> },
  getUserById: vi.fn(),
  createLog: vi.fn(),
}));

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit:
    (handler: (r: unknown, c: unknown) => Promise<Response>) =>
    async (request: unknown, context: { params: Promise<unknown> }) => {
      const { handleApiError } = await import('@/lib/api-error-handler');
      try {
        return await handler(request, { session: mocks.session, params: context.params });
      } catch (error) {
        return handleApiError(error);
      }
    },
}));
vi.mock('@/lib/prisma', () => ({ default: {} }));
vi.mock('@/services/audit.service', () => ({ auditService: { createLog: mocks.createLog } }));
vi.mock('@/services/user.service', () => ({
  UserService: class {
    getUserById = mocks.getUserById;
  },
}));

import { loginLockRemainingMs, recordLoginFailure } from '@/lib/login-throttle';
import { resetLoginThrottleForTests } from '@/lib/login-throttle';

import { POST } from '../route';

const EMAIL = 'locked@example.com';
const TARGET = { id: 'u-2', email: EMAIL, roles: [{ role: { name: 'ENGINEER' } }], clients: [] };
const ADMIN = { id: 'u-1', roles: ['ADMIN'], permissions: [], clientIds: [] };

type Route = (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>;
const call = () =>
  (POST as unknown as Route)(new NextRequest('http://localhost/api/users/u-2/unlock'), {
    params: Promise.resolve({ id: 'u-2' }),
  });

const lock = () => {
  for (let i = 0; i < 10; i++) recordLoginFailure(EMAIL);
  expect(loginLockRemainingMs(EMAIL)).toBeGreaterThan(0);
};

beforeEach(() => {
  vi.clearAllMocks();
  resetLoginThrottleForTests();
  mocks.session.user = ADMIN;
  mocks.getUserById.mockResolvedValue(TARGET);
  mocks.createLog.mockResolvedValue(undefined);
});

describe('POST /api/users/[id]/unlock', () => {
  it('잠긴 계정을 풀고 감사 기록을 남긴다', async () => {
    lock();

    const response = await call();

    expect(response.status).toBe(200);
    expect(loginLockRemainingMs(EMAIL)).toBe(0);
    expect(mocks.createLog.mock.calls[0]![1]).toMatchObject({
      userId: 'u-1',
      actionType: 'LOGIN_UNLOCK',
      targetId: 'u-2',
    });
  });

  it('권한이 없으면 403 이고 잠금을 유지한다', async () => {
    lock();
    mocks.session.user = { id: 'u-3', roles: ['ENGINEER'], permissions: [], clientIds: [] };

    const response = await call();

    expect(response.status).toBe(403);
    expect(loginLockRemainingMs(EMAIL)).toBeGreaterThan(0);
  });

  it('없는 사용자면 404 다', async () => {
    mocks.getUserById.mockResolvedValue(null);

    expect((await call()).status).toBe(404);
  });

  it('감사 기록이 실패해도 잠금은 풀린 상태로 성공한다', async () => {
    lock();
    mocks.createLog.mockRejectedValue(new Error('db down'));

    const response = await call();

    expect(response.status).toBe(200);
    expect(loginLockRemainingMs(EMAIL)).toBe(0);
  });
});
