import 'server-only';

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { expandRolePermissions } from '@/lib/role-permissions';
import { verifyPassword } from '@/lib/security';

import { authConfig } from './auth.config';

// Prisma 클라이언트가 초기화되었는지 확인하는 헬퍼 함수
function ensurePrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  return prisma;
}

/**
 * 토큰의 클레임을 DB 에서 다시 읽기까지의 간격.
 *
 * 왜 필요한가(감사 4.1): 세션이 JWT 이므로 roles/permissions/clientIds/isActive 는
 * 발급 시점의 스냅샷이다. 예전에는 최초 로그인과 `trigger === 'update'`(둘 다 클라이언트가
 * 주도한다) 에서만 갱신했고, 어떤 라우트도 `isActive` 를 재확인하지 않았다. 그래서
 * 계정을 비활성화하거나 역할을 회수해도 대상이 세션 갱신을 트리거하지 않는 한
 * 세션 수명이 다할 때까지 접근이 유지됐다.
 *
 * 60초로 잡은 이유: 이 값이 곧 "권한 회수가 실효화되기까지의 최악 지연"이다. 더 짧게
 * 잡으면 요청당 조인 쿼리 빈도가 올라가고, 더 길면 회수가 늦어진다. 60초면 운영자가
 * "껐는데 아직 되네" 를 체감하지 않으면서 쿼리도 사용자당 분당 1회로 묶인다.
 */
const CLAIMS_REFRESH_INTERVAL_MS = 60_000;

type UserClaims = {
  roles: string[];
  clientIds: string[];
  sessionVersion: number;
};

/**
 * 사용자의 역할·권한·소속 고객사를 DB 에서 읽어 토큰에 담을 형태로 만든다.
 *
 * 반환값 `null` 은 **"이 사용자는 더 이상 세션을 가질 자격이 없다"** 는 뜻이다
 * (삭제됐거나 비활성화됨). 호출자는 이 경우 토큰을 파기해야 한다.
 * 조회 자체가 실패한 경우는 예외로 던진다 — 호출자가 "자격 없음" 과 "확인 불가" 를
 * 구분해야 하기 때문이다. 둘을 같은 값으로 뭉개면 DB 순단이 전원 로그아웃이 된다.
 */
async function loadUserClaims(userId: string): Promise<UserClaims | null> {
  const db = ensurePrismaClient();
  const userWithRoles = await db.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      sessionVersion: true,
      // 권한은 여기서 읽지 않는다. 토큰에 담지 않기 때문이다(role-permissions.ts 참조).
      // 4단계 중첩 조인이 사라져 이 쿼리 자체도 가벼워졌다.
      roles: {
        select: { role: { select: { name: true } } },
      },
      clients: {
        // 승인된 소속만 세션 clientIds 에 반영한다.
        // PENDING 소속은 데이터 접근 범위(clientIds)에서 제외되어 승인 전까지 차단된다.
        where: { status: 'APPROVED' },
        select: {
          clientId: true,
        },
      },
    },
  });

  // 삭제된 사용자 또는 비활성화된 사용자 → 세션 자격 상실.
  if (!userWithRoles || !userWithRoles.isActive) {
    return null;
  }

  return {
    roles: userWithRoles.roles.map((ur) => ur.role.name),
    clientIds: userWithRoles.clients.map((uc) => uc.clientId),
    sessionVersion: userWithRoles.sessionVersion,
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          logger.warn('[Auth] 이메일 또는 비밀번호 누락');
          return null;
        }

        try {
          const db = ensurePrismaClient();

          const user = await db.user.findUnique({
            where: {
              email: credentials.email as string,
            },
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
              password: true,
              isActive: true,
              roles: {
                include: {
                  role: {
                    include: {
                      permissions: {
                        include: {
                          permission: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });

          // Timing attack 방지: 사용자가 없어도 비밀번호 검증 로직 실행 (dummy comparison)
          const isPasswordValid = await verifyPassword(
            credentials.password as string,
            user?.password
          );

          if (!user || !isPasswordValid) {
            if (!user) {
              logger.warn(`[Auth] 사용자 찾을 수 없음: ${credentials.email}`);
            } else {
              logger.warn(`[Auth] 비밀번호 불일치: ${credentials.email}`);
            }
            return null;
          }

          // 비활성 사용자 로그인 차단
          if (!user.isActive) {
            logger.warn(`[Auth] 비활성 사용자: ${credentials.email}`);
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        } catch (error) {
          logger.error(
            '[Auth] 로그인 처리 중 에러',
            error instanceof Error ? error : new Error(String(error))
          );
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // The 'user' object is only passed on the first sign-in.
      const isSignIn = Boolean(user);

      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.image = user.image;
      }

      // 클레임을 다시 읽어야 하는 세 경우:
      //   1. 최초 로그인 — 토큰에 아직 클레임이 없다.
      //   2. `trigger === 'update'` — 클라이언트가 명시적으로 세션 갱신을 요청했다.
      //      (역할/소속을 바꾼 직후 UI 가 즉시 반영하려고 호출한다)
      //   3. 마지막 확인으로부터 CLAIMS_REFRESH_INTERVAL_MS 경과 — 비활성화·역할 회수가
      //      대상의 협조 없이도 실효화되는 유일한 경로다.
      const lastCheckedAt = typeof token.checkedAt === 'number' ? token.checkedAt : 0;
      const isStale = Date.now() - lastCheckedAt > CLAIMS_REFRESH_INTERVAL_MS;
      const shouldRefresh = isSignIn || trigger === 'update' || isStale;

      if (!shouldRefresh) {
        return token;
      }

      const userId = (user?.id ?? token.id) as string | undefined;
      if (!userId) {
        // id 없는 토큰은 애초에 인가에 쓸 수 없다.
        return null;
      }

      let claims: UserClaims | null;
      try {
        claims = await loadUserClaims(userId);
      } catch (error) {
        // 조회 실패는 "자격 없음" 이 아니라 "확인 불가" 다.
        //
        // 최초 로그인이라면 클레임 없는 토큰이 만들어지고, 그 토큰은 roles/permissions 가
        // 비어 있어 모든 인가를 통과하지 못한다(정책 계층은 fail-closed 다). 그래서
        // 이 경우만 토큰을 파기한다.
        //
        // 이미 유효한 토큰을 들고 있는 사용자라면 기존 클레임을 유지하고 `checkedAt` 은
        // 갱신하지 않는다 — 다음 요청에서 다시 시도하므로 DB 가 돌아오는 즉시 정상화된다.
        // DB 순단이 전 사용자 강제 로그아웃이 되는 쪽이 훨씬 나쁘다.
        logger.error(
          '[Auth] 세션 클레임 재조회 실패',
          error instanceof Error ? error : new Error(String(error)),
          { custom_userId: userId, custom_isSignIn: String(isSignIn) }
        );
        return isSignIn ? null : token;
      }

      // 비활성화되었거나 삭제된 사용자 → 세션 파기.
      // null 을 반환하면 Auth.js 가 세션 쿠키를 무효화한다.
      if (!claims) {
        logger.warn('[Auth] 비활성/삭제된 사용자의 세션을 파기했습니다.', {
          custom_userId: userId,
        });
        return null;
      }

      // 비밀번호가 변경되면 DB sessionVersion 이 증가한다. 이전 JWT가 들고 있던
      // 세대와 다르면 탈취된 세션을 포함해 전부 폐기한다(최대 지연은 위 재조회 TTL).
      const tokenSessionVersion =
        typeof token.sessionVersion === 'number' ? token.sessionVersion : undefined;
      if (
        !isSignIn &&
        tokenSessionVersion !== undefined &&
        tokenSessionVersion !== claims.sessionVersion
      ) {
        logger.warn('[Auth] 비밀번호 변경 이전 세션을 파기했습니다.', {
          custom_userId: userId,
        });
        return null;
      }

      token.roles = claims.roles;
      // permissions 는 **의도적으로 토큰에 넣지 않는다.** 쿠키 크기가 nginx 헤더 버퍼를
      // 넘겨 로그인 사용자만 502 를 받는 장애를 냈다(2026-08-08). session 콜백에서 편다.
      token.clientIds = claims.clientIds;
      token.sessionVersion = claims.sessionVersion;
      token.checkedAt = Date.now();

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        const roles = (token.roles as string[]) || [];

        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.image as string;
        session.user.roles = roles;
        session.user.clientIds = (token.clientIds as string[]) || [];
        // 권한은 쿠키가 아니라 여기서 채운다. 소비처(policies / permission-helpers /
        // 라우트)는 예전과 똑같이 `session.user.permissions` 를 읽으면 된다.
        session.user.permissions = await expandRolePermissions(roles);
      }
      return session;
    },
  },
});
