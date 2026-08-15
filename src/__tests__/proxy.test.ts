import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `src/proxy.ts` (Next.js 미들웨어) 의 분기 고정.
 *
 * 이 파일은 요청 하나가 통과하는 네 개의 관문을 순서대로 가진다:
 *   1. 정적 자산·`/_next/` skip (단, `/api/` 는 확장자로 끝나도 skip 하지 않는다)
 *   2. API 라우트 / Server Action 레이트리밋 (429)
 *   3. 인증 리다이렉트 (`/login`) — 판정은 `auth.config.ts` 의 `isAuthPagePath()`
 *   4. CSP nonce 발급
 * 각 관문의 조건을 양쪽으로 태운다.
 *
 * 이 파일은 한때 두 개의 버그를 **고정**하고 있었다: (a) `/api/data.json` 이 레이트리밋을
 * 건너뛴다는 단언, (b) `startsWith` 접두사 매칭. 둘 다 뒤집혔고, 각 자리에 회귀 방지
 * 케이스가 들어가 있다.
 *
 * 모킹 전략:
 *   - `next-auth` 의 `NextAuth()` 는 `{ auth }` 만 돌려주고, 그 `auth(handler)` 는
 *     핸들러를 그대로 반환한다. 덕분에 default export 를 직접 호출할 수 있다.
 *   - `next/server` 는 vitest alias 가 `src/__tests__/mocks/next-server.ts` 로 돌리는데
 *     거기에는 `NextResponse.next()` 가 없다(그 목은 수정 대상이 아니다). 그래서 이 파일
 *     안에서만 `next()`/`redirect()` 를 갖춘 대역을 세운다.
 */

const { MockNextResponse, checkMock, getClientIpMock } = vi.hoisted(() => {
  interface NextInit {
    request?: { headers?: Headers };
  }

  class MockNextResponse extends Response {
    /** `NextResponse.next({ request: { headers } })` 로 전달된 요청 헤더. */
    forwardedRequestHeaders: Headers | undefined;

    static next(init?: NextInit): MockNextResponse {
      const res = new MockNextResponse(null, { status: 200 });
      res.forwardedRequestHeaders = init?.request?.headers;
      return res;
    }

    static redirect(url: string | URL, status = 307): MockNextResponse {
      return new MockNextResponse(null, {
        status,
        headers: { location: url.toString() },
      });
    }
  }

  return {
    MockNextResponse,
    checkMock: vi.fn(async (_key: string) => ({
      allowed: true,
      limit: 100,
      resetTime: 60_000,
      remaining: 99,
    })),
    getClientIpMock: vi.fn((_headers: unknown) => 'client-key'),
  };
});

vi.mock('next/server', () => ({ NextResponse: MockNextResponse }));

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: (handler: unknown) => handler,
  })),
}));

// 미들웨어는 인증 **이전** 단계라 세션 쿠키를 검증할 수 없다. 그래서 IP 로만 키잉한다
// (감사 D-1 — 예전에는 getClientIdentifier 를 써서 쿠키만 바꾸면 전역 제한을 우회했다).
vi.mock('@/lib/rate-limiter', () => ({
  getClientIp: getClientIpMock,
  rateLimiters: {
    middleware: {
      check: checkMock,
    },
  },
}));

import proxy, { config } from '@/proxy';

interface FakeRequest {
  nextUrl: URL;
  method: string;
  headers: Headers;
  auth: unknown;
}

/** 위 대역이 돌려주는 응답. `NextResponse.next()` 로 전달된 요청 헤더를 들고 있다. */
interface ForwardingResponse extends Response {
  forwardedRequestHeaders?: Headers;
}

const middleware = proxy as unknown as (req: FakeRequest) => Promise<ForwardingResponse>;

const ORIGIN = 'https://sr.example.com';

function makeRequest(
  options: {
    path?: string;
    method?: string;
    headers?: Record<string, string>;
    auth?: unknown;
  } = {}
): FakeRequest {
  return {
    nextUrl: new URL(`${ORIGIN}${options.path ?? '/dashboard'}`),
    method: options.method ?? 'GET',
    headers: new Headers(options.headers ?? {}),
    auth: options.auth ?? null,
  };
}

const LOGGED_IN = { user: { id: 'u-1', name: '홍길동' } };

beforeEach(() => {
  checkMock.mockReset();
  checkMock.mockResolvedValue({ allowed: true, limit: 100, resetTime: 60_000, remaining: 99 });
  getClientIpMock.mockClear();
  getClientIpMock.mockReturnValue('client-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy (middleware)', () => {
  describe('1. 정적 자산 skip', () => {
    it.each([
      ['/_next/static/chunks/main.js', '/_next/ 접두사'],
      ['/_next/image?url=%2Ff.png', '/_next/ 접두사(쿼리 포함)'],
      ['/static/logo.png', '/static/ 접두사'],
      ['/assets/app.css', '확장자 정규식(.css)'],
      ['/manifest.json', '확장자 정규식(.json)'],
      ['/wasm/parser.wasm', '확장자 정규식(.wasm)'],
      ['/favicon.ico', '확장자 정규식(.ico)'],
    ])('%s 는 로직 없이 통과시킨다 (%s)', async (path) => {
      const res = await middleware(makeRequest({ path, auth: null }));

      expect(res.status).toBe(200);
      // skip 경로는 CSP·nonce 를 붙이지 않는다 — 이게 "건너뛰었다"의 관측 가능한 증거다.
      expect(res.headers.get('Content-Security-Policy')).toBeNull();
      expect(res.headers.get('x-nonce')).toBeNull();
      expect(res.forwardedRequestHeaders).toBeUndefined();
      // 비로그인 상태인데도 /login 리다이렉트가 일어나지 않아야 한다.
      expect(res.headers.get('location')).toBeNull();
    });

    it('정적 자산은 레이트리밋 예산을 소모하지 않는다', async () => {
      // 예전에는 이 단언을 `/api/data.json` 으로 했다 — 즉 확장자로 끝나는 API 경로가
      // 레이트리밋을 통째로 건너뛰는 버그를 테스트가 고정하고 있었다. 아래
      // "`/api/` 경로는 확장자로 끝나도 …" 가 그 반대편을 잡는다.
      await middleware(makeRequest({ path: '/assets/app.css' }));
      expect(checkMock).not.toHaveBeenCalled();
    });

    it.each([
      ['/api/data.json'],
      ['/api/files/report.json'],
      ['/api/export/sheet.css'],
      ['/api/bundle.js'],
      ['/api/parser.wasm'],
    ])('%s 는 확장자로 끝나도 skip 되지 않는다', async (path) => {
      // 회귀 방지: 확장자 분기에서 `!isApiRoute` 가 빠지면 `.json` 을 붙이는 것만으로
      // 미들웨어 레이트리밋을 무제한 우회할 수 있다.
      const res = await middleware(makeRequest({ path }));

      expect(checkMock).toHaveBeenCalledWith('client-key');
      expect(res.headers.get('Content-Security-Policy')).not.toBeNull();
    });

    it('확장자로 끝나는 API 경로도 한도를 넘으면 429 를 받는다', async () => {
      checkMock.mockResolvedValue({ allowed: false, limit: 20, resetTime: 42_000, remaining: 0 });

      const res = await middleware(makeRequest({ path: '/api/files/report.json' }));

      expect(res.status).toBe(429);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('20');
    });

    it('/_next/ 와 /static/ 접두사 skip 은 그대로 유지한다', async () => {
      // 이 두 접두사는 `/api/` 와 겹칠 수 없으므로 fix 의 영향 밖이다.
      // skip 의 원래 목적(더블 슬래시 static chunk 로드 버그 방지)이 살아 있는지 본다.
      for (const path of ['/_next/static/chunks/main.js', '/static/logo.png']) {
        const res = await middleware(makeRequest({ path }));
        expect(res.headers.get('Content-Security-Policy')).toBeNull();
      }
      expect(checkMock).not.toHaveBeenCalled();
    });

    it('확장자가 없는 경로는 skip 하지 않고 전체 로직을 태운다', async () => {
      const res = await middleware(makeRequest({ path: '/assets/app', auth: LOGGED_IN }));

      expect(res.headers.get('Content-Security-Policy')).not.toBeNull();
    });

    it('확장자가 경로 중간에만 있으면 skip 하지 않는다', async () => {
      // 정규식은 `$` 앵커가 있으므로 '/report.pdf/detail' 은 자산이 아니다.
      const res = await middleware(makeRequest({ path: '/report.json/detail', auth: LOGGED_IN }));

      expect(res.headers.get('x-nonce')).not.toBeNull();
    });
  });

  describe('2. 레이트리밋', () => {
    // 세션 쿠키가 아니라 **IP** 로 키잉해야 한다. 미들웨어는 인증 이전 단계라 쿠키를
    // 검증할 수 없으므로, 쿠키 값을 키로 쓰면 값을 바꾸는 것만으로 전역 제한이 무력화된다.
    it('API 라우트는 요청 헤더에서 뽑은 IP 로 버킷을 조회한다', async () => {
      getClientIpMock.mockReturnValue('5.6.7.8');
      const req = makeRequest({ path: '/api/sr' });

      await middleware(req);

      // 요청 객체 전체가 아니라 headers 를 넘긴다 — 쿠키를 볼 수 없는 형태다.
      expect(getClientIpMock).toHaveBeenCalledWith(req.headers);
      expect(checkMock).toHaveBeenCalledWith('5.6.7.8');
    });

    it('한도를 넘으면 429 와 X-RateLimit-* 헤더를 돌려준다', async () => {
      checkMock.mockResolvedValue({
        allowed: false,
        limit: 20,
        resetTime: 42_000,
        remaining: 0,
      });

      const res = await middleware(makeRequest({ path: '/api/sr' }));

      expect(res.status).toBe(429);
      await expect(res.text()).resolves.toBe('Too Many Requests');
      expect(res.headers.get('X-RateLimit-Limit')).toBe('20');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(res.headers.get('X-RateLimit-Reset')).toBe('42000');
      // 429 는 조기 반환이므로 CSP 단계까지 가지 않는다.
      expect(res.headers.get('Content-Security-Policy')).toBeNull();
    });

    it('429 는 비로그인 상태의 인증 리다이렉트보다 우선한다', async () => {
      checkMock.mockResolvedValue({ allowed: false, limit: 5, resetTime: 1_000, remaining: 0 });

      const res = await middleware(makeRequest({ path: '/api/sr', auth: null }));

      expect(res.status).toBe(429);
      expect(res.headers.get('location')).toBeNull();
    });

    it('next-action 헤더가 붙은 POST 는 API 밖에서도 레이트리밋한다', async () => {
      const res = await middleware(
        makeRequest({
          path: '/sr/new',
          method: 'POST',
          headers: { 'next-action': '7f3a' },
          auth: LOGGED_IN,
        })
      );

      expect(checkMock).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
    });

    it('next-action 헤더가 없는 POST 는 Server Action 이 아니다', async () => {
      await middleware(makeRequest({ path: '/sr/new', method: 'POST', auth: LOGGED_IN }));

      expect(checkMock).not.toHaveBeenCalled();
    });

    it('next-action 헤더가 있어도 GET 이면 Server Action 이 아니다', async () => {
      await middleware(
        makeRequest({
          path: '/sr/new',
          method: 'GET',
          headers: { 'next-action': '7f3a' },
          auth: LOGGED_IN,
        })
      );

      expect(checkMock).not.toHaveBeenCalled();
    });

    it('일반 페이지 GET 은 레이트리밋 대상이 아니다', async () => {
      await middleware(makeRequest({ path: '/dashboard', auth: LOGGED_IN }));

      expect(checkMock).not.toHaveBeenCalled();
      expect(getClientIpMock).not.toHaveBeenCalled();
    });
  });

  describe('3. 인증 리다이렉트', () => {
    it.each([['/dashboard'], ['/sr'], ['/sr/123/edit'], ['/settings/profile']])(
      '비로그인 상태에서 보호된 경로 %s 는 /login 으로 보낸다',
      async (path) => {
        const res = await middleware(makeRequest({ path, auth: null }));

        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
        expect(res.headers.get('location')).toBe(`${ORIGIN}/login`);
      }
    );

    it('비로그인 상태의 루트(/) 도 /login 으로 보낸다', async () => {
      const res = await middleware(makeRequest({ path: '/', auth: null }));

      expect(res.headers.get('location')).toBe(`${ORIGIN}/login`);
    });

    it('리다이렉트는 요청 origin 을 유지한다', async () => {
      const req: FakeRequest = {
        nextUrl: new URL('http://localhost:3000/sr?tab=open'),
        method: 'GET',
        headers: new Headers(),
        auth: null,
      };

      const res = await middleware(req);

      expect(res.headers.get('location')).toBe('http://localhost:3000/login');
    });

    it.each([['/login'], ['/login/reset'], ['/register'], ['/register/step-2']])(
      '비로그인 상태에서 인증 페이지 %s 는 리다이렉트하지 않는다',
      async (path) => {
        const res = await middleware(makeRequest({ path, auth: null }));

        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
        expect(res.headers.get('Content-Security-Policy')).not.toBeNull();
      }
    );

    it.each([
      ['/loginish'],
      ['/login-audit'],
      ['/registered-clients'],
      ['/register-report'],
      ['/logins'],
    ])('인증 페이지 접두사만 공유하는 %s 는 비로그인 시 /login 으로 보낸다', async (path) => {
      // 회귀 방지: `startsWith('/login')` 로 되돌리면 이 경로들이 인증 페이지로 판정되어
      // 비로그인 상태로 통과한다. 지금은 `auth.config.ts` 의 `isAuthPagePath()` 가
      // 정확 매칭 + `/` 로 끊긴 하위 경로만 인정한다.
      const res = await middleware(makeRequest({ path, auth: null }));

      expect(res.headers.get('location')).toBe(`${ORIGIN}/login`);
    });

    it('비로그인 API 요청은 리다이렉트가 아니라 그대로 통과시킨다', async () => {
      // API 는 리다이렉트로 답하면 클라이언트가 HTML 을 JSON 으로 파싱하게 된다.
      const res = await middleware(makeRequest({ path: '/api/sr', auth: null }));

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('auth 는 있으나 user 가 없으면 비로그인으로 취급한다', async () => {
      const res = await middleware(makeRequest({ path: '/dashboard', auth: {} }));

      expect(res.headers.get('location')).toBe(`${ORIGIN}/login`);
    });

    it('auth 자체가 undefined 여도 안전하게 비로그인 처리한다', async () => {
      const res = await middleware({
        nextUrl: new URL(`${ORIGIN}/dashboard`),
        method: 'GET',
        headers: new Headers(),
        auth: undefined,
      });

      expect(res.headers.get('location')).toBe(`${ORIGIN}/login`);
    });

    it.each([['/dashboard'], ['/'], ['/login']])(
      '로그인 상태에서는 %s 를 리다이렉트하지 않는다',
      async (path) => {
        const res = await middleware(makeRequest({ path, auth: LOGGED_IN }));

        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
      }
    );
  });

  describe('4. CSP 와 nonce', () => {
    async function cspOf(path = '/dashboard') {
      const res = await middleware(makeRequest({ path, auth: LOGGED_IN }));
      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).not.toBeNull();
      return { res, csp: csp as string };
    }

    it('nonce 를 응답 헤더와 CSP 양쪽에 동일하게 싣는다', async () => {
      const { res, csp } = await cspOf();
      const nonce = res.headers.get('x-nonce');

      expect(nonce).toBeTruthy();
      expect(csp).toContain(`'nonce-${nonce}'`);
    });

    it('nonce 는 UUID 를 base64 로 인코딩한 값이다', async () => {
      const { res } = await cspOf();
      const nonce = res.headers.get('x-nonce') as string;

      const decoded = Buffer.from(nonce, 'base64').toString('utf8');
      expect(decoded).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('요청마다 새 nonce 를 발급한다', async () => {
      const a = await cspOf();
      const b = await cspOf();

      expect(a.res.headers.get('x-nonce')).not.toBe(b.res.headers.get('x-nonce'));
    });

    it('다운스트림 요청 헤더에 x-nonce 를 심고 원본 헤더는 보존한다', async () => {
      const res = await middleware(
        makeRequest({
          path: '/dashboard',
          headers: { 'x-real-ip': '10.0.0.7', accept: 'text/html' },
          auth: LOGGED_IN,
        })
      );

      const forwarded = res.forwardedRequestHeaders;
      expect(forwarded).toBeInstanceOf(Headers);
      expect(forwarded?.get('x-nonce')).toBe(res.headers.get('x-nonce'));
      expect(forwarded?.get('x-real-ip')).toBe('10.0.0.7');
      expect(forwarded?.get('accept')).toBe('text/html');
    });

    it("script-src 에서 'unsafe-inline' 을 제거했다 (감사 4.1)", async () => {
      const { csp } = await cspOf();
      const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));

      expect(scriptSrc).toBeDefined();
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it("style-src 의 'unsafe-inline' 은 의도적으로 남긴다", async () => {
      const { csp } = await cspOf();
      const styleSrc = csp.split(';').find((d) => d.trim().startsWith('style-src'));

      expect(styleSrc).toContain("'unsafe-inline'");
    });

    it.each([
      ['default-src', "default-src 'self'"],
      ['object-src', "object-src 'none'"],
      ['base-uri', "base-uri 'self'"],
      ['form-action', "form-action 'self'"],
      ['frame-ancestors', "frame-ancestors 'none'"],
    ])('%s 지시문을 유지한다', async (_name, directive) => {
      const { csp } = await cspOf();
      expect(csp).toContain(directive);
    });

    it('개행과 연속 공백을 접어 한 줄로 만든다', async () => {
      const { csp } = await cspOf();

      expect(csp).not.toMatch(/\n/);
      expect(csp).not.toMatch(/ {2}/);
      expect(csp.trim()).toBe(csp);
    });

    it("development 에서는 'unsafe-eval' 을 허용한다", async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const { csp } = await cspOf();

      expect(csp).toContain("'unsafe-eval'");
    });

    it.each([['production'], ['test']])("%s 에서는 'unsafe-eval' 이 없다", async (env) => {
      vi.stubEnv('NODE_ENV', env);
      const { csp } = await cspOf();

      expect(csp).not.toContain("'unsafe-eval'");
      // 삼항의 빈 문자열 분기가 지시문을 망가뜨리지 않는지도 본다.
      expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' ?;/);
    });
  });

  describe('matcher 설정', () => {
    const matcher = new RegExp(`^${config.matcher[0]!}$`);

    it.each([['/dashboard'], ['/api/sr'], ['/'], ['/login'], ['/report.pdf']])(
      '%s 는 미들웨어를 태운다',
      (path) => {
        expect(matcher.test(path)).toBe(true);
      }
    );

    it.each([
      ['/_next/static/chunks/main.js'],
      ['/_next/image'],
      ['/favicon.ico'],
      ['/manifest.json'],
      ['/sw.js'],
      ['/logo.png'],
      ['/img/hero.webp'],
    ])('%s 는 미들웨어에서 제외한다', (path) => {
      expect(matcher.test(path)).toBe(false);
    });

    it('matcher 는 정확히 하나의 패턴이다', () => {
      expect(config.matcher).toHaveLength(1);
    });
  });
});
