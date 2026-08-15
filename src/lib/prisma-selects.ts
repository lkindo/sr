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

/**
 * 인가 판정에만 필요한 SR 필드 (db-rules §4).
 *
 * `policies.ts` 의 `SRAccessFields` 와 같은 모양이다. SR 은 `description`(무제한 TEXT),
 * `intakeNotes`, `resolutionDescription`, `rejectionReason` 같은 큰 필드를 갖고 있어
 * 인가만 하려고 전체 행을 읽으면 그 값들이 그대로 메모리에 올라온다.
 *
 * 쓰기 경로(첨부 삭제·업로드)에는 이것 대신 `SR_ACCESS_WITH_STATUS_SELECT` 를 쓴다 —
 * 아래 주석 참조.
 */
export const SR_ACCESS_SELECT = {
  id: true,
  clientId: true,
  requesterId: true,
  assigneeId: true,
} as const;

/**
 * 인가 + **상태**가 필요한 경로용.
 *
 * `canDeleteAttachment` 는 `sr.requesterId === user.id && sr.status === 'REQUESTED'` 로
 * "요청자 본인이 아직 접수 전인 자기 SR 의 첨부를 지우는" 경우를 허용한다.
 * 그런데 그 시그니처의 `status` 는 **선택적**(`status?: string`)이라, 위의 4필드 select 를
 * 주면 **타입 오류 없이** `undefined` 가 되어 그 분기가 영원히 거짓이 된다 —
 * 요청자 본인의 첨부 삭제가 조용히 불가능해진다.
 *
 * 첨부를 붙일 때도 마찬가지다. `ensureCanAttachToSR` 은 종결된 SR(COMPLETED/CONFIRMED/
 * REJECTED)을 막는데, 그 판정 역시 `status` 를 읽는다.
 *
 * **쓰기 경로에서는 반드시 이 상수를 쓴다.**
 */
export const SR_ACCESS_WITH_STATUS_SELECT = {
  ...SR_ACCESS_SELECT,
  status: true,
} as const;

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
