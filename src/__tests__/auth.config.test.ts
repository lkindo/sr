import { describe, expect, it } from 'vitest';

import { authConfig, isAuthPagePath } from '@/auth.config';

/**
 * `authorized()` 콜백의 인가 판정을 분기 단위로 고정한다.
 *
 * 이 콜백은 의존성이 0 인 순수 함수인데도 커버리지가 비어 있었다. 분기는 네 축으로 갈린다:
 *   - `!!auth?.user` (auth 없음 / auth 는 있으나 user 없음 / user 있음)
 *   - `isAuthPagePath()` (`/login`·`/register` 와 그 하위 경로만)
 *   - 루트 경로 여부
 *   - 그 조합으로 갈리는 세 개의 early return
 * 아래 표가 그 조합을 모두 태운다.
 *
 * 인증 페이지 판정은 예전에 `startsWith('/login')` 이었고, 이 파일은 그 잘못된 동작
 * (`/loginish` 가 인증 페이지)을 고정하고 있었다. 지금은 뒤집혀 있다 — 아래
 * "경계에서 끊기지 않는 …" 케이스가 그 회귀를 잡는다.
 */

const authorized = authConfig.callbacks.authorized;
type AuthorizedParams = Parameters<typeof authorized>[0];

const ORIGIN = 'https://sr.example.com';

type AuthState = 'anonymous' | 'auth-object-without-user' | 'logged-in';

function callAuthorized(pathname: string, state: AuthState) {
  const auth =
    state === 'logged-in'
      ? { user: { id: 'u-1', name: '홍길동' } }
      : state === 'auth-object-without-user'
        ? {}
        : null;

  return authorized({
    auth,
    request: { nextUrl: new URL(`${ORIGIN}${pathname}`) },
  } as unknown as AuthorizedParams);
}

function isRedirectToDashboard(result: unknown): boolean {
  if (!(result instanceof Response)) return false;
  return (
    result.status >= 300 &&
    result.status < 400 &&
    result.headers.get('location') === `${ORIGIN}/dashboard`
  );
}

describe('auth.config', () => {
  describe('세션 정책', () => {
    it('JWT 전략을 8시간 상한으로 고정한다', () => {
      // 30일 기본값은 역할 회수·계정 비활성화를 최대 30일간 무력화한다(파일 주석 참조).
      expect(authConfig.session.strategy).toBe('jwt');
      expect(authConfig.session.maxAge).toBe(8 * 60 * 60);
    });

    it('로그인·오류 페이지를 /login 으로 보낸다', () => {
      expect(authConfig.pages).toEqual({
        signIn: '/login',
        signOut: '/',
        error: '/login',
      });
    });

    it('Edge 번들에 provider 를 싣지 않는다', () => {
      // proxy.ts 가 이 설정으로 NextAuth 를 초기화한다. provider 가 들어오면
      // bcryptjs·Prisma 가 Edge 번들로 딸려 들어간다.
      expect(authConfig.providers).toEqual([]);
    });
  });

  describe('isAuthPagePath()', () => {
    it.each([['/login'], ['/register'], ['/login/reset'], ['/register/step-2'], ['/login/a/b/c']])(
      '%s 는 인증 페이지다',
      (pathname) => {
        expect(isAuthPagePath(pathname)).toBe(true);
      }
    );

    it.each([
      ['/loginish'],
      ['/login-audit'],
      ['/registered-clients'],
      ['/register-report'],
      ['/logins'],
      ['/'],
      ['/dashboard'],
      ['/api/login'],
      ['/x/login'],
      ['/login2/reset'],
    ])('%s 는 인증 페이지가 아니다', (pathname) => {
      expect(isAuthPagePath(pathname)).toBe(false);
    });

    it('authorized() 의 비로그인 허용 집합이 헬퍼와 정확히 일치한다', () => {
      // 콜백이 헬퍼를 안 쓰고 자체 판정을 다시 갖는 순간(예전 상태) 어긋난다.
      // 비로그인 통과 = 인증 페이지이거나 루트, 그 외엔 전부 false.
      const paths = [
        '/login',
        '/login/reset',
        '/register',
        '/register/step-2',
        '/loginish',
        '/login-audit',
        '/registered-clients',
        '/',
        '/dashboard',
        '/api/users',
      ];

      for (const pathname of paths) {
        const expected = isAuthPagePath(pathname) || pathname === '/';
        expect({ pathname, allowed: callAuthorized(pathname, 'anonymous') }).toEqual({
          pathname,
          allowed: expected,
        });
      }
    });
  });

  describe('authorized() — 비로그인', () => {
    it.each([['/dashboard'], ['/sr'], ['/sr/123/edit'], ['/settings/profile'], ['/api/users']])(
      '보호된 경로 %s 는 false 로 막는다',
      (pathname) => {
        expect(callAuthorized(pathname, 'anonymous')).toBe(false);
      }
    );

    it.each([
      ['/loginish'],
      ['/login-audit'],
      ['/registered-clients'],
      ['/register-report'],
      ['/loginx/deep'],
    ])('경계에서 끊기지 않는 %s 는 인증 페이지가 아니라 보호된 경로다', (pathname) => {
      // 회귀 방지: `startsWith('/login')` 로 되돌리면 이 경로들이 다시 true 가 되어
      // 비로그인 접근이 통과한다. 그 순간 이 테스트가 빨간불이 되어야 한다.
      expect(callAuthorized(pathname, 'anonymous')).toBe(false);
    });

    it.each([['/login'], ['/login/reset'], ['/register'], ['/register/step-2']])(
      '인증 페이지 %s 는 그대로 허용한다',
      (pathname) => {
        expect(callAuthorized(pathname, 'anonymous')).toBe(true);
      }
    );

    it('루트(/) 는 막지 않고 허용한다', () => {
      expect(callAuthorized('/', 'anonymous')).toBe(true);
    });

    it('auth 객체는 있으나 user 가 없으면 비로그인으로 본다', () => {
      // `!!auth?.user` 의 "auth 는 truthy, user 는 undefined" 분기.
      expect(callAuthorized('/dashboard', 'auth-object-without-user')).toBe(false);
    });
  });

  describe('authorized() — 로그인', () => {
    it.each([['/login'], ['/register']])(
      '인증 페이지 %s 접근은 /dashboard 로 리다이렉트한다',
      (pathname) => {
        const result = callAuthorized(pathname, 'logged-in');
        expect(isRedirectToDashboard(result)).toBe(true);
      }
    );

    it('루트(/) 접근은 /dashboard 로 리다이렉트한다', () => {
      const result = callAuthorized('/', 'logged-in');
      expect(isRedirectToDashboard(result)).toBe(true);
    });

    it('리다이렉트 대상은 요청 origin 을 유지한다', () => {
      const result = authorized({
        auth: { user: { id: 'u-1' } },
        request: { nextUrl: new URL('https://internal.corp.local:8443/login?next=%2Fsr') },
      } as unknown as AuthorizedParams);

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).headers.get('location')).toBe(
        'https://internal.corp.local:8443/dashboard'
      );
    });

    it.each([['/login/reset'], ['/register/step-2']])(
      '인증 페이지 하위 경로 %s 접근도 /dashboard 로 리다이렉트한다',
      (pathname) => {
        expect(isRedirectToDashboard(callAuthorized(pathname, 'logged-in'))).toBe(true);
      }
    );

    it.each([
      ['/dashboard'],
      ['/sr'],
      ['/settings/profile'],
      ['/api/users'],
      ['/loginish'],
      ['/register-report'],
    ])('보호된 경로 %s 는 리다이렉트 없이 true 다', (pathname) => {
      expect(callAuthorized(pathname, 'logged-in')).toBe(true);
    });
  });
});
