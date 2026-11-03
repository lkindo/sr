/**
 * 정책 공통: 역할·식별 타입과 내부 사용자 판정, 활동·댓글의 가시성 규칙
 */

import { Client, Prisma, SR, User } from '@prisma/client';

import { INTERNAL_ACTIVITY_METADATA_KEY } from '@/lib/constants/sr';
import { ForbiddenError } from '@/lib/errors';
import { hasPermissionFlag } from '@/lib/permission-helpers';
import { AuthenticatedUser } from '@/types/session';

export const INTERNAL_ROLES = ['ADMIN', 'MANAGER', 'ENGINEER'];

/**
 * 권한 검증에 필요한 SR 필드만 추린 형태.
 * 전체 SR 객체 대신 이 형태만 요구하여, 라우트에서 `as any` 캐스팅 없이
 * `select`로 필요한 필드만 조회해 정책 함수에 전달할 수 있게 한다.
 */
export type SRAccessFields = Pick<SR, 'id' | 'clientId' | 'requesterId' | 'assigneeId'>;

/** 권한 검증에 필요한 Client 식별 필드(id)만 추린 형태. */
export type ClientAccessFields = Pick<Client, 'id'>;

/**
 * 권한 검증에 필요한 User 식별 필드(id)와 테넌트 판정을 위한 소속 고객사 목록.
 * 소속 정보가 전달되지 않으면(undefined/null) 소속이 없는 것으로 간주하여
 * 외부 사용자에게는 테넌트 조건이 성립하지 않도록(차단) 처리한다.
 */
export type UserIdentity = Pick<User, 'id'> & {
  clients?: { clientId: string }[] | null;
  roles?: { role: { name: string } }[] | null;
};

/** 역할 할당 정책이 비교하는 최소 역할/권한 형태. */
export type RoleGrantFields = {
  name: string;
  permissions?: { permission: { resource: string; action: string } }[] | null;
};

/**
 * 시스템 관리자(ADMIN)인가. ADMIN 전용 기능(시스템 설정·알림 아웃박스·사용자 완전 삭제)의 판정.
 * 예전에는 각 라우트가 `roles.includes('ADMIN')` 을 직접 비교했다(헌법 §1.2 — 판정은 이 파일 한 곳).
 */
export function isSystemAdmin(user: AuthenticatedUser): boolean {
  return user.roles?.includes('ADMIN') ?? false;
}

/**
 * 감사 로그를 조회할 수 있는가 — ADMIN 만(헌법 §1.1, 2026-09-18 소유자 결정 D11). 감사 로그에는 전 고객사의
 * 관리 행위와 변경 전후 값(이메일 등)이 들어 있어 테넌트 범위로 나눌 수 없다.
 */
export function ensureCanViewAuditLogs(user: AuthenticatedUser): void {
  ensureSystemAdmin(user, '감사 로그는 시스템 관리자만 조회할 수 있습니다.');
}

export function ensureSystemAdmin(user: AuthenticatedUser, message: string): void {
  if (!isSystemAdmin(user)) {
    throw new ForbiddenError(message);
  }
}

/** 이 권한을 실제로 가졌는가 — ADMIN 은 모든 권한을 암묵적으로 가진다(서버 정책 전반과 같다). */
export function hasEffectivePermission(user: AuthenticatedUser, permission: string): boolean {
  return isSystemAdmin(user) || hasPermissionFlag(user, permission);
}

export function isInternalUser(user: AuthenticatedUser): boolean {
  return user.roles?.some((role) => INTERNAL_ROLES.includes(role)) ?? false;
}

/**
 * 활동의 내부 전용 값(키는 constants/sr 의 INTERNAL_ACTIVITY_METADATA_KEY — 마감일 조정 사유, D9)을 고객에게서 지운다.
 * 활동 자체("SLA 마감일 조정: A → B")는 고객도 본다 — 고객도 마감일을 본다. 조정 이유는 운영 판단이라
 * 내부에만 둔다. 활동을 내려보내는 모든 경로(상세·활동 목록·활동 API)가 이 함수를 거친다.
 */
export function redactActivityForViewer<T extends { metadata?: unknown }>(
  viewer: AuthenticatedUser,
  activity: T
): T {
  if (isInternalUser(viewer)) return activity;
  const metadata = activity.metadata;
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata) ||
    !(INTERNAL_ACTIVITY_METADATA_KEY in metadata)
  ) {
    return activity;
  }
  // 키 이름은 INTERNAL_ACTIVITY_METADATA_KEY('internalReason')와 같다 — 구조 분해로 빼낸다.
  const { internalReason: _internalReason, ...rest } = metadata as { internalReason?: unknown };
  return { ...activity, metadata: rest };
}

/**
 * 고객을 대신해 SR 을 등록할 수 있는가(대리 등록 — 소유자 결정 2026-09-18 D3). 내부 사용자만.
 * 고객사 관리자가 동료 이름으로 SR 을 만드는 것은 결정 범위 밖이라 열지 않는다.
 */
export function canRegisterSROnBehalf(user: AuthenticatedUser): boolean {
  return isInternalUser(user);
}

/**
 * 이 고객사의 SR 신청자가 될 수 있는 사용자 — 활성이고, 그 고객사 소속이 **승인**됐고, 내부 역할이 없다.
 * 대리 등록 대상 목록(화면)과 서버 검증이 같은 조건을 쓰도록 한 곳에 둔다.
 */
export function eligibleRequesterWhere(clientId: string): Prisma.UserWhereInput {
  return {
    isActive: true,
    clients: { some: { clientId, status: 'APPROVED' } },
    roles: { none: { role: { name: { in: INTERNAL_ROLES } } } },
  };
}

/**
 * 내부 노트(고객에게 보이지 않는 댓글)를 쓸 수 있는가 — 내부 사용자(ADMIN·MANAGER·ENGINEER)만.
 * 헌법 §1.1 "ENGINEER·MANAGER·ADMIN만 작성 및 조회" 와 읽기 쪽 visibleCommentsWhere 와 같은 경계다.
 */
export function canWriteInternalNote(user: AuthenticatedUser): boolean {
  return isInternalUser(user);
}

/**
 * 이 사용자에게 보여도 되는 댓글만 고르는 where 조각. 내부 댓글(`isInternal`)은 내부 사용자에게만 보인다.
 *
 * 댓글을 읽거나 세는 경로는 전부 이것을 쓴다 — SR 상세(`getSRDetailsById`), 댓글 탭(`getSRComments`),
 * REST `GET /api/srs/[id]/comments`, SR 목록의 댓글 수(`getAllSRs`), 내 요청의 댓글 수. 예전에는
 * 앞의 세 곳이 같은 삼항식을 각자 복제했고, 뒤의 두 곳은 필터가 아예 없어 내부 댓글이 생기면
 * 고객사 사용자의 목록에만 그 개수가 섞일 상태였다. 규칙이 여러 곳에 있으면 반드시 갈라진다.
 */
export function visibleCommentsWhere(user: AuthenticatedUser): Prisma.SRCommentWhereInput {
  return isInternalUser(user) ? {} : { isInternal: false };
}
