/**
 * 화면 판정: 뷰어별 수정·확인·재오픈·첨부·접수·배정 가능 여부와 잠금 메시지
 */

import type { SRStatus } from '@prisma/client';

import {
  getReopenBlock,
  INTERNAL_ROLE_NAMES,
  type ReopenBlock,
  type ReopenSubject,
  type ReopenViewer,
} from './rules';
import { canPerformTransition, validateTransition } from './transitions';

/** 화면이 버튼과 안내를 그리는 데 쓰는 판정 결과. */
export interface ReopenAvailability {
  /** 재오픈 버튼을 보여 줄지. 신청자이거나 역할/권한상 재오픈 전이가 열린 사용자에게만 보인다. */
  visible: boolean;
  /** 보이지만 막혀 있으면 그 이유. null 이면 누를 수 있다. */
  block: ReopenBlock | null;
}

/**
 * `src/lib/policies.ts` 의 `canUpdateSR` 과 **같은 판정**을 하는 클라이언트 사본.
 *
 * 왜 사본인가: 서버의 상태 전이는 `srService.updateSR` 에서 `ensureCanUpdateSR`(403) 를
 * 먼저 통과해야 상태 머신에 도달한다. 그런데 policies.ts 는 errors → logger 를 끌어와
 * 클라이언트 번들에 넣을 수 없다. 이 판정을 화면이 모르면, 같은 고객사의 **신청자가 아닌**
 * CLIENT_USER 는 역할표(TRANSITION_ROLES)만 보고 활성 재오픈 버튼을 받은 뒤 403 을 맞는다.
 *
 * ⚠️ 사본이므로 갈라질 수 있다. `src/lib/__tests__/sr-reopen-availability.test.ts` 가
 * 역할·권한·소속·SR 고객사·신청자·담당자 조합 전체에서 policies.canUpdateSR 과 결과가
 * 같은지 대조한다(아래 `!!sr.clientId` 가드도 그 대조에 포함된다).
 * canUpdateSR 을 고치면 여기도 함께 고쳐야 그 테스트가 통과한다.
 */
export function canViewerUpdateSR(
  viewer: ReopenViewer,
  sr: { clientId?: string | null; requesterId?: string | null; assigneeId?: string | null }
): boolean {
  const roles = viewer.roles ?? [];
  const permissions = viewer.permissions ?? [];

  if (roles.includes('ADMIN')) return true;
  if (roles.includes('MANAGER') && permissions.includes('SR:UPDATE')) return true;
  if (roles.includes('ENGINEER')) {
    return sr.assigneeId === viewer.id && permissions.includes('SR:UPDATE');
  }

  const belongsToClient = !!sr.clientId && (viewer.clientIds ?? []).includes(sr.clientId);
  if (permissions.includes('SR:UPDATE') && belongsToClient) return true;

  return sr.requesterId === viewer.id && permissions.includes('SR:UPDATE_SELF') && belongsToClient;
}

/**
 * 화면의 '확인 완료' 버튼을 보일지 — 서버가 거부하는 순서를 그대로 따른다:
 *   1. `ensureCanUpdateSR`(403) → canViewerUpdateSR
 *   2. `validateTransition`(역할·권한 표 + 신원 검사) → 같은 함수를 그대로 호출
 * 예전에는 화면이 "신청자인가" 만 보고 버튼을 보여 줘서, 자기 이름으로 SR 을 등록한 MANAGER 에게는
 * 누르면 반드시 거부되는 버튼이 떴다.
 */
export function canViewerConfirmSR(
  viewer: ReopenViewer,
  sr: {
    status: string;
    clientId?: string | null;
    requesterId?: string | null;
    assigneeId?: string | null;
    requesterIsInternal?: boolean | null;
  }
): boolean {
  if (sr.status !== 'COMPLETED') return false;
  if (!canViewerUpdateSR(viewer, sr)) return false;
  return validateTransition(
    'COMPLETED',
    'CONFIRMED',
    viewer.roles,
    sr,
    {},
    viewer.permissions,
    viewer.id,
    viewer.clientIds
  ).valid;
}

/**
 * 재오픈 버튼의 노출·비활성·이유를 한 번에 판정한다.
 *
 * 서버가 거부하는 순서를 그대로 따른다 — 같은 SR 에 대해 화면이 말하는 이유와 서버 응답이
 * 같아야 하기 때문이다:
 *   1. `ensureCanUpdateSR`(403)          → canViewerUpdateSR
 *   2. `validateTransition` 인가(400)    → 같은 함수의 인가 단계를 그대로 호출
 *   3. `validateTransition` 재오픈 규칙  → getReopenBlock
 *
 * 노출 조건은 예전과 같다(신청자 OR 역할/권한상 전이 가능). 넓히지도 좁히지도 않는다 —
 * 대신 "보이지만 누르면 반드시 실패하는 버튼" 을 비활성 + 이유로 바꾼다.
 */
export function getReopenAvailability(
  status: SRStatus,
  sr: ReopenSubject & { clientId?: string | null; requesterId?: string | null },
  viewer: ReopenViewer,
  now: Date | number = Date.now()
): ReopenAvailability {
  if (status !== 'COMPLETED' && status !== 'CONFIRMED') return { visible: false, block: null };

  const isRequester = !!viewer.id && viewer.id === sr.requesterId;
  const canTransition = canPerformTransition(
    status,
    'IN_PROGRESS',
    viewer.roles,
    viewer.permissions
  );
  if (!isRequester && !canTransition) return { visible: false, block: null };

  if (!canViewerUpdateSR(viewer, sr)) {
    const isInternal = (viewer.roles ?? []).some((role) => INTERNAL_ROLE_NAMES.includes(role));
    // 신청자 본인에게 "요청자 본인 또는 고객사 관리자만 재오픈할 수 있습니다" 라고 말하면,
    // 자기가 그 요청자인데 왜 막혔는지 알 수 없고 "요청자에게 요청해주세요" 는 자기 자신을
    // 가리킨다. 본인에게 모자란 것은 자격이 아니라 **권한**(SR:UPDATE_SELF)이므로,
    // 내부 사용자와 같이 권한을 말하고 다음 행동(관리자 문의)을 준다.
    // 인가 자체는 그대로다 — 두 경우 모두 서버는 ensureCanUpdateSR 에서 403 이다.
    const lacksPermission = isInternal || isRequester;
    return {
      visible: true,
      block: {
        code: 'NOT_PERMITTED',
        message: lacksPermission
          ? '이 SR을 수정할 권한이 없어 재오픈할 수 없습니다. 관리자에게 문의해주세요.'
          : '요청자 본인 또는 고객사 관리자만 재오픈할 수 있습니다. 재오픈이 필요하면 요청자나 고객사 관리자에게 요청해주세요.',
      },
    };
  }

  if (!canTransition) {
    // 서버 인가 단계의 문구를 그대로 쓴다(데이터 없이 부르면 흐름·인가만 판정한다).
    const authz = validateTransition(
      status,
      'IN_PROGRESS',
      viewer.roles,
      undefined,
      undefined,
      viewer.permissions
    );
    return {
      visible: true,
      block: {
        code: 'NOT_PERMITTED',
        message: authz.message ?? '이 상태 변경을 수행할 권한이 없습니다.',
      },
    };
  }

  return { visible: true, block: getReopenBlock(status, sr, now) };
}

/**
 * SR 의 **운영자**인가 — 접수 이후 SR 내용과 운영자 소유 값(접수 결과·완료 내용·거절 사유)을 쓸 수 있는
 * 사람. 내부 역할(ADMIN·MANAGER·ENGINEER) 또는 SR:ASSIGN 보유자(외부 커스텀 운영 역할 포함).
 *
 * 서버(policies.canWriteSROperatorFields)와 화면(SR 상세·수정 다이얼로그)이 **이 함수 하나**를 쓴다.
 * 이 모듈은 화면도 import 하므로 여기 둔다(policies.ts 는 서버 전용이다).
 * SR:ASSIGN 은 prisma/seed.ts 에 실제로 시딩된 권한이다 — 시딩되지 않은 이름을 쓰면 아무도 보유할 수
 * 없어 조용히 전원이 차단된다.
 */
export function isSROperator(viewer: { roles?: string[]; permissions?: string[] }): boolean {
  const isInternal = (viewer.roles ?? []).some((role) => INTERNAL_ROLE_NAMES.includes(role));
  return isInternal || holdsPermission(viewer, 'SR:ASSIGN');
}

/** 권한 보유 여부. 전이 판정(validateTransition)과 같게 대소문자를 무시한다. */
function holdsPermission(viewer: { permissions?: string[] }, permission: string): boolean {
  return (viewer.permissions ?? []).some((granted) => granted.toUpperCase() === permission);
}

/**
 * 종결된 SR 상태 — 감사 추적 대상이라 첨부를 붙일 수 없다. 서버(policies.ensureCanAttachToSR)와 화면
 * (첨부 업로드 버튼)이 이 목록 하나를 쓴다.
 */
export const SR_CLOSED_STATUSES: readonly string[] = ['COMPLETED', 'CONFIRMED', 'REJECTED'];

/**
 * 이 SR 에 첨부를 올릴 수 있는가 — policies.ensureCanAttachToSR 의 클라이언트 사본(canViewerUpdateSR 과
 * 같은 이유로 사본이다). 수정 권한 + ATTACHMENT:CREATE(ADMIN 은 암묵) + 종결 상태가 아님.
 * 예전에는 업로드 버튼을 누구에게나 보여 줘서, 종결 SR 이나 수정 권한이 없는 사용자는 누르면 반드시 403 이었다.
 * ⚠️ 사본이므로 sr-reopen-availability.test.ts 가 서버 판정과 전 조합에서 대조한다.
 */
export function canViewerAttachToSR(
  viewer: ReopenViewer,
  sr: {
    status: string;
    clientId?: string | null;
    requesterId?: string | null;
    assigneeId?: string | null;
  }
): boolean {
  if (SR_CLOSED_STATUSES.includes(sr.status)) return false;
  if (!canViewerUpdateSR(viewer, sr)) return false;
  return (
    (viewer.roles ?? []).includes('ADMIN') ||
    (viewer.permissions ?? []).includes('ATTACHMENT:CREATE')
  );
}

/** 운영 관리자 역할 — 접수(트리아지)와 담당자 배정을 맡는다(헌법 §1.1·§4). */
const OPERATIONS_MANAGER_ROLES = ['ADMIN', 'MANAGER'];

/**
 * SR 을 접수할 수 있는가 — ADMIN·MANAGER, 또는 SR:INTAKE 를 받은 커스텀 역할.
 * 소유자 결정(2026-09-18, D1): ENGINEER 는 접수하지 않는다. 서버(policies.canIntakeSR)와 화면(접수
 * 페이지·목록의 접수 버튼·대시보드 접수 대기 카드)이 이 함수 하나를 쓴다.
 */
export function canViewerIntakeSR(viewer: { roles?: string[]; permissions?: string[] }): boolean {
  const isManager = (viewer.roles ?? []).some((role) => OPERATIONS_MANAGER_ROLES.includes(role));
  return isManager || holdsPermission(viewer, 'SR:INTAKE');
}

/**
 * SR 담당자를 배정·변경할 수 있는가 — ADMIN·MANAGER, 또는 SR:ASSIGN 을 받은 커스텀 역할(D1).
 * 서버는 policies.canAssignSR 로 이 함수를 쓴다.
 */
export function canViewerAssignSR(viewer: { roles?: string[]; permissions?: string[] }): boolean {
  const isManager = (viewer.roles ?? []).some((role) => OPERATIONS_MANAGER_ROLES.includes(role));
  return isManager || holdsPermission(viewer, 'SR:ASSIGN');
}

/** 종결된 SR 의 SLA 근거(마감일·서비스 카테고리·실제 우선순위)를 바꾸려 할 때의 안내. */
export const SR_SLA_BASIS_LOCKED_MESSAGE =
  '종결된 SR의 마감일·서비스 카테고리·실제 우선순위는 바꿀 수 없습니다. 고쳐야 하면 SR을 다시 연 뒤 수정하세요.';

/**
 * 이 상태에서 SLA 근거(마감일·서비스 카테고리·실제 우선순위)를 바꿀 수 있는가(D9).
 * 종결(완료·확인완료·거절)된 SR 은 SLA 판정이 끝났다. 판정 뒤 근거를 바꾸면 위반을 준수로 소급해 바꿀 수 있고,
 * 종결 SR 상세는 마감일 칸을 보여 주지 않아 아무도 알아채지 못한다.
 */
export function canChangeSLABasisAt(status: string): boolean {
  return !SR_CLOSED_STATUSES.includes(status);
}

/**
 * SLA 시계가 돌고 있는 상태 — 접수 전에는 시계가 돌지 않고, 종결 뒤에는 판정이 끝났다.
 * 마감일 조정 가능 상태이자 '지연 중' 지표(헌법 §3, 결정 D10)의 대상 상태다. 서버 집계 SQL 도 같은 목록을 쓴다.
 */
export const SR_SLA_OPEN_STATUSES: readonly string[] = ['INTAKE', 'IN_PROGRESS', 'ON_HOLD'];

const DUE_DATE_ADJUSTABLE_STATUSES = SR_SLA_OPEN_STATUSES;

/**
 * 이 SR 의 SLA 마감일을 직접 조정할 수 있는가(헌법 §2·§3, 2026-09-18 소유자 결정 D9).
 *  - 접수·진행중·보류 상태에서만 한다.
 *  - 기본은 운영자(isSROperator)다.
 *  - 한 번 완료된 적 있는 SR(재오픈 포함)은 접수 권한자(ADMIN·MANAGER 또는 SR:INTAKE)만 한다. 재작업 당사자가
 *    기준 마감일을 옮기면 '재작업은 서비스 실패로 계상'이 무력화된다. `wasCompleted` 는 서버가 채운다.
 * 서버(sr.service.updateSR)는 상태 잠금(canChangeSLABasisAt)과 완료 이력 규칙을 같은 뜻으로 판정한다.
 */
export function canViewerAdjustDueDate(
  viewer: { roles?: string[]; permissions?: string[] },
  sr: { status: string; wasCompleted?: boolean }
): boolean {
  if (!DUE_DATE_ADJUSTABLE_STATUSES.includes(sr.status)) return false;
  if (sr.wasCompleted) return canViewerIntakeSR(viewer);
  return isSROperator(viewer);
}

/** 접수 이후 운영자가 아닌 사람이 SR 내용을 고치려 할 때의 안내. 서버 거부와 화면 안내가 같은 문장을 쓴다. */
export const SR_CONTENT_LOCKED_MESSAGE =
  'SR이 접수된 뒤에는 요청 내용을 직접 수정할 수 없습니다. 변경이 필요하면 댓글로 담당자에게 알려주세요.';

/**
 * 이 상태의 SR 내용을 고칠 수 있는가(소유자 결정, 2026-09-18). 접수 전(REQUESTED)에는 SR 을 수정할 수
 * 있는 사람 누구나, 접수 이후에는 운영자만. 서버의 상세 규칙(만족도·추가 의견 예외, 전이 요청 처리)은
 * policies.ensureCanEditSRContent 에 있고, 이 함수는 화면이 수정 버튼을 켤지 정하는 데 쓴다.
 */
export function canEditSRContentAt(
  status: string,
  viewer: { roles?: string[]; permissions?: string[] }
): boolean {
  return status === 'REQUESTED' || isSROperator(viewer);
}
