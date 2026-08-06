/**
 * Prisma 공통 Select / Include Projection 상수 정의
 */

export const USER_SUMMARY_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

export const CLIENT_SUMMARY_SELECT = {
  id: true,
  code: true,
  name: true,
} as const;

export const USER_WITH_ROLES_INCLUDE = {
  roles: {
    include: {
      role: true,
    },
  },
  clients: {
    include: {
      client: true,
    },
  },
} as const;
