/**
 * 인증된 세션 타입 정의
 * NextAuth Session을 확장하여 타입 안정성 보장
 */

import type { Session } from "next-auth";

/**
 * 인증된 사용자 정보
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  roles: string[];
  permissions: string[];
}

/**
 * 인증된 세션 (user가 항상 존재)
 */
export interface AuthenticatedSession extends Session {
  user: AuthenticatedUser;
}

/**
 * Session이 인증되었는지 확인하는 타입 가드
 */
export function isAuthenticatedSession(
  session: Session | null
): session is AuthenticatedSession {
  return session !== null && session.user !== undefined && session.user.id !== undefined;
}

