import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import prisma from "@/lib/prisma";
import type { User } from "@prisma/client";
import { authConfig } from "./auth.config";

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

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email as string,
          },
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
    async jwt({ token, user }) {
      // The 'user' object is only passed on the first sign-in.
      if (user) {
        // Type assertion using 'any' to access extended properties
        const userWithRoles = user as any;
        
        token.id = userWithRoles.id;
        token.email = userWithRoles.email;
        token.name = userWithRoles.name;
        token.image = userWithRoles.image;

        // Extract roles and permissions from the user object if they exist
        if ('roles' in userWithRoles && Array.isArray(userWithRoles.roles)) {
          token.roles = userWithRoles.roles.map((ur: any) => ur.role.name);

          const permissionsSet = new Set<string>();
          userWithRoles.roles.forEach((ur: any) => {
            if (ur.role && ur.role.permissions && Array.isArray(ur.role.permissions)) {
              ur.role.permissions.forEach((rp: any) => {
                permissionsSet.add(`${rp.permission.resource}.${rp.permission.action}`);
              });
            }
          });
          token.permissions = Array.from(permissionsSet);
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
        session.user.roles = token.roles as string[];
        session.user.permissions = token.permissions as string[];
      }
      return session;
    },
  },
});
