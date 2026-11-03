/**
 * 기초 규칙: 재오픈 창과 차단 사유, 확인완료 수행자, 완료 후 거절 차단
 */

import type { SRStatus } from '@prisma/client';

import { formatAppZoneDate, formatAppZoneTime } from '@/lib/timezone';

export type { SRStatus };

/**
 * 재오픈 가능 창(일). 헌법 §2 의 "7일" 이 이 상수 하나로만 표현되도록 모은다.
 * 라우트·클라이언트가 각자 7 을 하드코딩하면 한쪽만 바뀌어 판정이 갈린다.
 * (2026-09-18 까지 SRStatusActions 가 `REOPEN_WINDOW_MS` 사본을 들고 있었다.)
 */
const REOPEN_WINDOW_DAYS = 7;

const REOPEN_WINDOW_MS = REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** 이 전이가 재오픈인가. 활동 이력 타입 분기 등 호출부가 같은 판정을 복제하지 않도록 export 한다. */
export function isReopenTransition(from: SRStatus, to: SRStatus): boolean {
  return (from === 'COMPLETED' || from === 'CONFIRMED') && to === 'IN_PROGRESS';
}

/**
 * 재오픈 창의 기산점과 그 시각이 무엇인지(완료/확인). 출발 상태에 따라 다르다 —
 * 확인완료에서 되돌리면 확인 시각부터 센다. 확인 시각이 없으면 완료 시각으로 폴백하며,
 * 그때 안내 문구도 "완료" 로 말해야 사실과 맞는다.
 * 기산점을 알 수 없으면 null 을 돌려주며, 호출부는 이를 **거부** 로 처리한다(fail-closed).
 *
 * 모듈 내부 전용이다. 밖으로 내보내면 라우트가 다시 자체 창 판정을 갖게 되고,
 * 그게 정확히 2026-08-15 이전의 fail-open 버그가 생긴 경위다. 밖에서는 아래
 * `getReopenBlock` 만 쓴다.
 */
function reopenAnchor(
  from: SRStatus,
  data: { completedAt?: Date | string | null; confirmedAt?: Date | string | null }
): { at: Date; label: '완료' | '확인' } | null {
  // `!= null` 이다(truthy 가 아니다). 빈 문자열까지 "확인 시각이 없다" 로 보고 completedAt
  // 으로 폴백하면, 기록이 손상된 SR 이 fail-closed 를 빠져나가 재오픈될 수 있다.
  const useConfirmed = from === 'CONFIRMED' && data.confirmedAt != null;
  const raw = useConfirmed ? data.confirmedAt : data.completedAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return { at: parsed, label: useConfirmed ? '확인' : '완료' };
}

/**
 * 안내 문구에 싣는 시각. 사용자는 KST 로 읽으므로 앱 타임존으로 고정한다.
 *
 * 표기는 화면의 다른 일시와 같은 `YYYY. MM. DD. HH:mm` 이다(settings/outbox 와 같은 조합).
 * `formatISODateInAppZone` 의 `YYYY-MM-DD` 는 파일명·date input 용 표기라 같은 페이지의
 * 접수 일시("2026. 09. 16. …")와 나란히 놓이면 다른 시스템의 값처럼 보인다.
 */
function formatReopenDateTime(value: Date): string {
  return `${formatAppZoneDate(value)} ${formatAppZoneTime(value)}`;
}

/** 재오픈이 막힌 이유의 종류. UI 분기·테스트가 문구 대신 이 코드로 판정한다. */
type ReopenBlockCode =
  /** 이 사용자에게는 재오픈 권한이 없다(UI 전용 — 서버는 인가 단계에서 403/400). */
  | 'NOT_PERMITTED'
  /** 기산점(완료/확인 시각)을 알 수 없다 — fail-closed. */
  | 'ANCHOR_UNKNOWN'
  /** 기산점으로부터 7일(168시간)이 지났다. */
  | 'WINDOW_EXPIRED'
  /** 담당자가 없다. 재오픈은 진행중 전이라 담당자가 필수인데 완료 상태에서는 지정할 수 없다. */
  | 'ASSIGNEE_MISSING';

export interface ReopenBlock {
  code: ReopenBlockCode;
  /** 사용자에게 그대로 보여 줄 문구. 서버 거부 메시지와 글자까지 같다. */
  message: string;
  /** 창의 기산점. 기산점을 알 수 없거나 권한 문제면 없다. */
  anchorAt?: Date;
  /** 재오픈 기한(기산점 + 7일). */
  deadlineAt?: Date;
}

/** 재오픈 판정에 필요한 SR 필드. */
export interface ReopenSubject {
  completedAt?: Date | string | null;
  confirmedAt?: Date | string | null;
  assigneeId?: string | null;
}

/**
 * 재오픈을 막는 **데이터 규칙**(창·기산점·담당자)의 단일 판정 지점.
 *
 * 서버(`validateTransition`)와 화면(`SRStatusActions`)이 모두 이 함수를 부른다.
 * 예전에는 화면이 자체 사본(completedAt 만 보는 7일 판정)을 들고 있어서
 *   - CONFIRMED 출발에서 서버는 confirmedAt, 화면은 completedAt 을 봐 늦게 확인한 SR 의
 *     재오픈 버튼을 화면이 잘못 막았고 문구도 "확인 후" 가 아니라 "완료 후" 였다.
 *   - 기산점이 NULL 이거나 담당자가 없으면 화면은 제출을 허용하고 서버가 400 을 돌려줬다.
 * 규칙이 두 곳에 있으면 반드시 갈라진다. 여기 하나만 둔다.
 *
 * 판정 순서는 "고칠 수 없는 이유" 부터다: 기산점 불명 → 창 만료 → 담당자 없음.
 * 권한은 여기서 보지 않는다(서버는 인가 단계에서 먼저 거른다) — `getReopenAvailability` 참고.
 *
 * @param from 현재 상태. 재오픈 출발 상태(COMPLETED/CONFIRMED)가 아니면 null.
 * @param now 판정 시각. 테스트가 경계를 고정할 수 있게 주입받는다.
 */
export function getReopenBlock(
  from: SRStatus,
  sr: ReopenSubject,
  now: Date | number = Date.now()
): ReopenBlock | null {
  if (from !== 'COMPLETED' && from !== 'CONFIRMED') return null;

  const anchor = reopenAnchor(from, sr);
  if (!anchor) {
    // 화면에 없는 '종결 시각' 대신 사용자가 상세 화면에서 보는 이름(완료/확인)으로 말하고,
    // 부정을 한 번만 쓴다("…없어 …없으므로 …없습니다" 는 읽고도 이유가 남지 않는다).
    const missing = from === 'CONFIRMED' ? '확인' : '완료';
    return {
      code: 'ANCHOR_UNKNOWN',
      message:
        `${missing} 시각 기록이 없어 재오픈 기한(${REOPEN_WINDOW_DAYS}일)을 확인할 수 없습니다. ` +
        '추가 작업이 필요하면 새 SR을 등록하거나 관리자에게 문의해주세요.',
    };
  }

  const anchorAt = anchor.at;
  const deadlineAt = new Date(anchorAt.getTime() + REOPEN_WINDOW_MS);
  const nowMs = now instanceof Date ? now.getTime() : now;

  // 경계: 정확히 168시간째까지는 허용한다(예전 `daysSince > 7` 과 같은 판정).
  if (nowMs > deadlineAt.getTime()) {
    return {
      code: 'WINDOW_EXPIRED',
      message:
        `${anchor.label} 후 ${REOPEN_WINDOW_DAYS}일이 지나 재오픈할 수 없습니다. ` +
        `(${anchor.label} ${formatReopenDateTime(anchorAt)} · 재오픈 기한 ${formatReopenDateTime(deadlineAt)}) ` +
        '추가 작업이 필요하면 새 SR을 등록해주세요.',
      anchorAt,
      deadlineAt,
    };
  }

  if (!sr.assigneeId) {
    return {
      code: 'ASSIGNEE_MISSING',
      message:
        '담당자가 지정되지 않아 재오픈할 수 없습니다. ' +
        '완료된 SR에는 담당자를 새로 지정할 수 없으니 관리자에게 문의해주세요.',
      anchorAt,
      deadlineAt,
    };
  }

  return null;
}

/** 재오픈 버튼을 판정할 때 보는 사용자. 세션(`session.user`)에서 그대로 옮긴다. */
export interface ReopenViewer {
  id: string;
  roles: string[];
  permissions: string[];
  clientIds: string[];
}

/** policies.ts 의 INTERNAL_ROLES 와 같다(안내 문구를 고르는 데만 쓴다). */
export const INTERNAL_ROLE_NAMES = ['ADMIN', 'MANAGER', 'ENGINEER'];

/**
 * 확인완료(고객 인수)의 **신원** 판정 — 이 사람이 이 SR 을 확인할 자격이 있는가.
 * 역할·권한 표(TRANSITION_ROLES/PERMISSIONS)는 validateTransition 이 이보다 먼저 본다.
 *
 * - 원칙: 그 SR 의 **신청자 본인**(헌법 §1.1·§2).
 * - 예외(소유자 결정 2026-09-18): 운영자(내부 사용자)가 **자기 이름으로** 등록한 SR 은 고객 신청자가 없어
 *   아무도 확인할 수 없었다. 그런 SR 은 등록한 운영자 본인(위 원칙으로 이미 허용) **또는 그 SR 고객사의
 *   고객사 관리자(CLIENT_ADMIN)** 가 확인한다. 고객 사용자가 신청한 SR 에는 이 예외가 없다 — 같은 고객사의
 *   CLIENT_ADMIN 이라도 남의 SR 을 대신 확인할 수 없다.
 *
 * `requesterIsInternal` 은 서버가 신청자의 역할로 계산해 넣는 값이다(`srService.isInternalRequester`,
 * SR 상세 응답의 같은 필드). 값이 없거나 true 가 아니면 예외는 열리지 않는다(fail-closed).
 * 서버(validateTransition·상태 라우트)와 화면(`canViewerConfirmSR`)이 이 함수 하나를 쓴다.
 */
export function canConfirmAsAcceptor(
  actor: { id?: string | null; roles?: string[]; clientIds?: string[] },
  sr:
    | {
        requesterId?: string | null;
        clientId?: string | null;
        requesterIsInternal?: boolean | null;
      }
    | null
    | undefined
): boolean {
  const requesterId = sr?.requesterId;
  if (!requesterId || !actor.id) return false;
  if (requesterId === actor.id) return true;

  return (
    sr?.requesterIsInternal === true &&
    !!sr.clientId &&
    (actor.roles ?? []).includes('CLIENT_ADMIN') &&
    (actor.clientIds ?? []).includes(sr.clientId)
  );
}

/** 한 번 완료된 SR 의 거절을 막을 때의 안내. 서버 거부와 화면이 같은 문장을 쓴다. */
export const SR_REJECT_AFTER_COMPLETION_MESSAGE =
  '한 번 완료된 SR은 거절로 끝낼 수 없습니다. 재작업을 마치면 다시 완료 처리하세요.';

/** 한 번이라도 완료된 SR(재오픈 포함)인가 — 거절 금지(D9)의 판정. `wasCompleted` 는 서버가 채운다. */
export function isRejectBlockedAfterCompletion(
  sr: { wasCompleted?: boolean } | null | undefined
): boolean {
  return sr?.wasCompleted === true;
}
