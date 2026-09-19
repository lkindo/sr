import 'next-auth';

declare module 'next-auth' {
  interface User {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    roles?: string[];
    permissions?: string[];
    clientIds?: string[];
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image: string | null;
      roles: string[];
      permissions: string[];
      clientIds: string[];
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    roles: string[];
    permissions: string[];
    clientIds: string[];
    /** 비밀번호 변경 시 증가하며, 이전 세대 JWT는 재검증 시 폐기된다. */
    sessionVersion?: number;
    /**
     * roles/permissions/clientIds 를 DB 에서 마지막으로 확인한 시각(epoch ms).
     * `src/auth.ts` 의 jwt 콜백이 이 값으로 재조회 주기를 판단한다 —
     * 이것이 없으면 클레임이 세션 수명 내내 발급 시점 스냅샷으로 고정된다.
     */
    checkedAt?: number;
    /**
     * 로그인한 시각(epoch ms). 세션 절대 수명(결정 D13)의 기준이다 — 슬라이딩 갱신과 무관하게
     * 이 시각으로부터 `SESSION_ABSOLUTE_MAX_AGE_SECONDS` 가 지나면 토큰을 버린다(src/auth.config.ts).
     */
    loginAt?: number;
  }
}
