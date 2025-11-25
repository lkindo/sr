import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "@/lib/prisma";
import type { User } from "@prisma/client";
import { authConfig } from "./auth.config";

// Prisma 클라이언트가 초기화되었는지 확인하는 헬퍼 함수
function ensurePrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  return prisma;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

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

        if (!user) {
          return null;
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // The 'user' object is only passed on the first sign-in.
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.image = user.image;

        // 사용자의 roles와 permissions를 조회하여 token에 추가
        const db = ensurePrismaClient();
        const userWithRoles = await db.user.findUnique({
          where: { id: user.id },
          include: {
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
            clients: {
              select: {
                clientId: true,
              },
            },
          },
        });

        if (userWithRoles) {
          // roles 배열 생성
          const roles = userWithRoles.roles.map((ur) => ur.role.name);
          token.roles = roles;

          // permissions 배열 생성 (중복 제거)
          const permissionsSet = new Set<string>();
          userWithRoles.roles.forEach((ur) => {
            ur.role.permissions.forEach((rp) => {
              const permission = `${rp.permission.resource}:${rp.permission.action}`;
              permissionsSet.add(permission);
            });
          });
          token.permissions = Array.from(permissionsSet);

          // clientIds 배열 생성
          token.clientIds = userWithRoles.clients.map((uc) => uc.clientId);
        } else {
          token.roles = [];
          token.permissions = [];
          token.clientIds = [];
        }
      }

      // 세션 업데이트 시 roles와 permissions를 다시 조회
      if (trigger === "update") {
        const db = ensurePrismaClient();
        const userWithRoles = await db.user.findUnique({
          where: { id: token.id as string },
          include: {
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
            clients: {
              select: {
                clientId: true,
              },
            },
          },
        });

        if (userWithRoles) {
          const roles = userWithRoles.roles.map((ur) => ur.role.name);
          token.roles = roles;

          const permissionsSet = new Set<string>();
          userWithRoles.roles.forEach((ur) => {
            ur.role.permissions.forEach((rp) => {
              const permission = `${rp.permission.resource}:${rp.permission.action}`;
              permissionsSet.add(permission);
            });
          });
          token.permissions = Array.from(permissionsSet);

          // clientIds 배열 생성
          token.clientIds = userWithRoles.clients.map((uc) => uc.clientId);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.image as string;
        session.user.roles = (token.roles as string[]) || [];
        session.user.permissions = (token.permissions as string[]) || [];
        session.user.clientIds = (token.clientIds as string[]) || [];
      }
      return session;
    },
  },
});
