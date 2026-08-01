import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 4.1 회귀 테스트 — 자격증명 로그인에 strict 리미터가 적용되지 않던 문제.
 *
 * 이 라우트는 `export const { GET, POST } = handlers` 로 Auth.js 핸들러를 그대로
 * 내보내고 있었다. 그래서 로그인 POST 는 미들웨어의 일반 버킷만 거치고
 * `rateLimiters.strict`(분당 5회)는 한 번도 통과하지 않았다 — 자격증명 스터핑에
 * 사실상 열려 있었다.
 */

const mocks = vi.hoisted(() => ({
  authGet: vi.fn(),
  authPost: vi.fn(),
}));

vi.mock('@/auth', () => ({
  handlers: { GET: mocks.authGet, POST: mocks.authPost },
}));

import { rateLimiters } from '@/lib/rate-limiter';

import { POST } from '../[...nextauth]/route';

const loginRequest = (email: string, ip = '203.0.113.10') => {
  const form = new FormData();
  form.set('email', email);
  form.set('password', 'hunter2');
  return new Request('http://localhost:3000/api/auth/callback/credentials', {
    method: 'POST',
    body: form,
    headers: { 'x-real-ip': ip },
  });
};

const sessionRequest = () =>
  new Request('http://localhost:3000/api/auth/session', {
    method: 'POST',
    headers: { 'x-real-ip': '203.0.113.10' },
  });

beforeEach(async () => {
  vi.clearAllMocks();
  await rateLimiters.strict.resetAll();
  mocks.authPost.mockResolvedValue(new Response('ok', { status: 200 }));
});

describe('POST /api/auth/[...nextauth] — 자격증명 로그인', () => {
  it('strict 예산(분당 5회)을 초과하면 429 를 반환한다', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(loginRequest('victim@example.com'));
      expect(res.status, `${i + 1}번째 시도가 막혔다`).toBe(200);
    }

    const blocked = await POST(loginRequest('victim@example.com'));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    // 차단된 요청은 Auth.js 까지 가지 않는다 — 비밀번호 검증 비용도 쓰지 않는다.
    expect(mocks.authPost).toHaveBeenCalledTimes(5);
  });

  it('이메일이 다르면 예산을 따로 쓴다', async () => {
    for (let i = 0; i < 5; i++) {
      await POST(loginRequest('a@example.com'));
    }
    expect((await POST(loginRequest('a@example.com'))).status).toBe(429);

    // 같은 IP 라도 다른 계정 시도는 아직 열려 있어야 한다(정상 사용자 잠금 방지).
    expect((await POST(loginRequest('b@example.com'))).status).toBe(200);
  });

  it('같은 계정을 다른 IP 에서 두드려도 각각 제한된다', async () => {
    for (let i = 0; i < 5; i++) {
      await POST(loginRequest('victim@example.com', '198.51.100.1'));
    }
    expect((await POST(loginRequest('victim@example.com', '198.51.100.1'))).status).toBe(429);
    // IP 를 바꾸면 새 예산이지만, 그 예산도 5회로 제한된다.
    expect((await POST(loginRequest('victim@example.com', '198.51.100.2'))).status).toBe(200);
  });

  it('로그인이 아닌 Auth.js 엔드포인트는 strict 를 거치지 않는다', async () => {
    // session/csrf 는 정상 사용 중에도 자주 호출된다. 여기에 5회 제한을 걸면 앱이 멈춘다.
    for (let i = 0; i < 12; i++) {
      const res = await POST(sessionRequest());
      expect(res.status).toBe(200);
    }
    expect(mocks.authPost).toHaveBeenCalledTimes(12);
  });
});
