import type { NextAuthConfig } from 'next-auth';

/**
 * 세션 수명. Auth.js 기본값은 30일인데, 이 시스템에서는 그 값이 인가 통제를 무력화한다
 * (감사 4.1). 세션이 서명된 JWT 이고 서버 측 세션 레코드가 없으므로, 토큰 안의
 * roles/permissions/clientIds/활성여부는 **발급 시점의 스냅샷**이다. 30일이면
 * `DELETE /api/users/[id]`(소프트 비활성화)나 역할 회수가 최대 30일간 효력이 없다.
 *
 * 8시간으로 줄인 근거: 사내 업무 시스템이고 근무일 한 번의 로그인으로 하루가 덮인다.
 * 이보다 짧으면 업무 중 재로그인이 발생하고, 길면 퇴근 후 방치된 세션이 다음 날까지 산다.
 *
 * 이것만으로는 부족하다 — 8시간도 비활성화된 계정에게는 긴 시간이다. 그래서 `src/auth.ts`
 * 의 jwt 콜백이 60초 TTL 로 클레임을 재조회하고, 비활성/삭제 계정은 즉시 세션을 파기한다.
 *
 * 이 8시간은 **절대 상한이 아니다.** Auth.js 는 세션을 조회할 때마다 토큰을 다시 서명하고 쿠키 만료를 늘리므로,
 * 마지막 사용으로부터 8시간이다(슬라이딩). 그래서 아래 절대 수명을 따로 둔다.
 */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * 세션 절대 수명(2026-09-18 소유자 결정 D13). 로그인한 지 이 시간이 지나면 사용 중이어도 다시 로그인한다.
 * 예전에는 슬라이딩 방식뿐이라 탈취된 쿠키를 계속 쓰면 세션이 무기한 이어졌다. 근무일 하루를 덮는 12시간이다.
 */
export const SESSION_ABSOLUTE_MAX_AGE_SECONDS = 12 * 60 * 60;

/**
 * 토큰이 절대 수명을 넘겼는가. 로그인 시각(`loginAt`)은 `src/auth.ts` 의 jwt 콜백이 로그인 때 싣는다.
 * 이 판정은 DB 가 필요 없는 시각 비교라 엣지 미들웨어(아래 authConfig 의 jwt 콜백)와 서버(auth.ts)가 함께 쓴다 —
 * 한쪽에만 두면 미들웨어가 계속 로그인 상태로 보고 쿠키를 다시 발급한다.
 */
export function isSessionPastAbsoluteLifetime(
  // JWT 는 Record<string, unknown> 를 확장하므로 그 형태로 받는다(선택 속성만 있는 타입은 weak type 검사에 걸린다).
  token: Record<string, unknown>,
  now = Date.now()
): boolean {
  return (
    typeof token.loginAt === 'number' &&
    now - token.loginAt > SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000
  );
}

/** 인증(비보호) 페이지의 루트 경로들. 이 목록과 그 하위 경로만 비로그인 접근을 허용한다. */
const AUTH_PAGE_ROOTS = ['/login', '/register'] as const;

/**
 * 인증 페이지 판정. `/login`, `/register` 와 **그 하위 경로만** 참이다.
 *
 * 원래는 `pathname.startsWith('/login')` 이었다. 그 형태는 접두사만 보므로
 * `/loginish`, `/login-audit`, `/registered-clients` 처럼 **경계에서 잘리지 않는** 경로까지
 * 인증 페이지로 판정했다. 인증 페이지는 "비로그인도 통과"라는 뜻이므로, 그런 라우트를
 * 하나라도 추가하는 순간 조용히 무인증 노출이 된다(당시엔 해당 라우트가 없어 실제 우회는
 * 아니었지만, 다음에 `/register-report` 를 만드는 사람이 그 사실을 알 방법이 없다).
 *
 * 그래서 정확 매칭 + `/` 로 끊긴 하위 경로만 허용한다. `/login/reset` 은 참,
 * `/login-audit` 은 거짓이다.
 *
 * 이 함수를 `auth.config.ts` 에서 export 하는 이유: 같은 판정을 `src/proxy.ts` 의 미들웨어도
 * 해야 하는데, 두 곳에 복붙해 두면 한쪽만 고쳐졌을 때 인가 판정이 서로 어긋난다.
 * proxy 가 이미 이 모듈을 import 하고 있으므로 여기가 단일 출처로 알맞다.
 * (Edge 번들에 들어가므로 의존성 없는 순수 함수로 유지할 것.)
 */
export function isAuthPagePath(pathname: string): boolean {
  return AUTH_PAGE_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export const authConfig = {
  providers: [],
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: '/login',
    signOut: '/',
    error: '/login',
  },
  callbacks: {
    // 엣지 미들웨어에서도 절대 수명을 넘긴 토큰을 버린다(서버 쪽은 src/auth.ts 의 jwt 콜백이 같은 판정을 한다).
    // 미들웨어는 모든 요청에서 쿠키를 다시 발급하므로, 이 변경 전에 발급돼 기준 시각이 없는 토큰에는 여기서
    // 시각을 실어 확실히 저장되게 한다(지금부터 센다).
    jwt({ token }) {
      if (isSessionPastAbsoluteLifetime(token)) return null;
      if (typeof token.loginAt !== 'number') token.loginAt = Date.now();
      return token;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage = isAuthPagePath(nextUrl.pathname);
      const isRootPath = nextUrl.pathname === '/';

      // 로그인하지 않은 상태에서 보호된 페이지 접근 시 로그인으로
      if (!isLoggedIn && !isAuthPage && !isRootPath) {
        return false;
      }

      // 로그인 상태에서 인증 페이지(/login, /register) 접근 시 대시보드로
      if (isLoggedIn && isAuthPage) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }

      // 로그인 상태에서 루트(/) 접근 시 대시보드로 즉시 리다이렉트
      if (isLoggedIn && isRootPath) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
