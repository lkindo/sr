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
    /**
     * roles/permissions/clientIds 를 DB 에서 마지막으로 확인한 시각(epoch ms).
     * `src/auth.ts` 의 jwt 콜백이 이 값으로 재조회 주기를 판단한다 —
     * 이것이 없으면 클레임이 세션 수명 내내 발급 시점 스냅샷으로 고정된다.
     */
    checkedAt?: number;
  }
}
