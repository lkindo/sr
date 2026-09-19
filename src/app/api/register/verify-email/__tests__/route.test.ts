import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 가입 이메일 인증 링크(2026-09-18 소유자 결정 D13 B+). 로그인 없이 여는 경로라 두 가지가 계약이다.
 * 1. 결과는 로그인 화면(`/login?verified=`)으로 돌려보내 알린다. 응답에 계정 정보를 싣지 않는다.
 * 2. 토큰이 담긴 URL 이 다음 화면의 Referer 로 새지 않게 한다.
 */
const { verifyEmailToken } = vi.hoisted(() => ({ verifyEmailToken: vi.fn() }));

vi.mock('@/services/email-verification.service', () => ({ verifyEmailToken }));
// `withErrorHandler` 는 `auth-wrapper` 에 있고, 그 모듈이 `@/auth` 를 정적 import 한다.
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: {
    logError: vi.fn(),
    logRequest: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { GET } from '../route';

const callGet = (query: string) =>
  (GET as never as (r: never, c: never) => Promise<Response>)(
    new Request(`http://localhost/api/register/verify-email${query}`) as never,
    { params: Promise.resolve({}) } as never
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/register/verify-email', () => {
  it.each(['verified', 'already', 'expired', 'invalid'] as const)(
    '결과(%s)를 로그인 화면으로 돌려보낸다',
    async (result) => {
      verifyEmailToken.mockResolvedValue(result);

      const res = await callGet('?token=abc.def');

      expect(verifyEmailToken).toHaveBeenCalledWith('abc.def');
      expect(res.status).toBe(303);
      expect(res.headers.get('Location')).toBe(`/login?verified=${result}`);
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.text()).toBe('');
    }
  );

  it('토큰이 없으면 확인하지 않고 invalid 로 돌려보낸다', async () => {
    const res = await callGet('');

    expect(verifyEmailToken).not.toHaveBeenCalled();
    expect(res.headers.get('Location')).toBe('/login?verified=invalid');
  });
});
