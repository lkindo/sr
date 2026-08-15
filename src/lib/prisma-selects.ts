/**
 * Prisma 공통 Select / Include Projection 상수 정의
 */

/**
 * 살아 있는 SR 만 고르는 where 조각 (db-rules §2 — SR 은 soft delete 다).
 *
 * **모든 SR 조회에 펼쳐 넣는다**: `where: { ...SR_ALIVE, clientId }`.
 * 상수 하나로 모아 두는 이유는 조회 지점이 30곳이 넘어서, 각 지점이 `deletedAt: null` 을
 * 기억해야 하는 구조면 반드시 어딘가 빠지기 때문이다. 빠진 곳은 조용히 삭제된 SR 을
 * 되살려 보여 준다 — 실패가 눈에 띄지 않는 종류라 더 위험하다.
 *
 * 관리자용 복구 화면처럼 삭제분을 **의도적으로** 봐야 하는 경로만 이 조각을 생략하고,
 * 그 자리에 생략 이유를 주석으로 남긴다.
 *
 * `$queryRaw` 는 이 상수가 닿지 않으므로 SQL 에 `AND deleted_at IS NULL` 을 직접 쓴다.
 */
export const SR_ALIVE = { deletedAt: null } as const;

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
