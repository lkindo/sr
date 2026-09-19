/**
 * SR 관련 공통 상수 정의
 */
import type { SRStatus } from '@prisma/client';

/**
 * SR 상태 라벨 — **정본**.
 *
 * `Record<SRStatus, string>` 으로 못박는다. 예전에는 `Record<string, string>` 이라
 * 상태가 추가되거나 키를 잘못 적어도 컴파일이 통과했고 **정본만 무방비**였다
 * (사본들은 오히려 enum 으로 타입이 걸려 있었다). 이제 SRStatus 가 늘면 여기서 먼저 깨진다.
 *
 * 화면 사본은 2026-08-10 에 흡수했다. 남은 것은 의도적 복제뿐이다 —
 * e2e/21 의 STATUS_LABELS(드리프트 감지)와 email.service 의 statusMap(외부 발송 격리).
 *
 * `import type` 이므로 런타임 의존이 생기지 않는다(빌드 시 elide) — 이 모듈은
 * 클라이언트 컴포넌트도 import 한다.
 *
 * ON_HOLD 는 '보류' 다(2026-08-09 확정). 예전에는 여기만 '대기' 였고 사본들은 이미
 * '보류' 였다 — 같은 상태가 화면에 따라 두 이름으로 보였다.
 *
 * REJECTED 는 '거절' 이다(2026-08-10 확정). 예전에는 여기만 '거부' 였다.
 * '거부' 를 버린 이유는 도메인이 아니라 **어휘 충돌**이다 — 이 저장소에서 '거부' 는
 * 이미 인가·검증 거부(403/400/429)를 뜻하는 지배 어휘이고, 특히 알림 설정 화면의
 * '권한 거부됨'(settings/notifications/page.tsx:131)과 글자까지 같아져 로그·스크린샷에서
 * SR 상태인지 권한 실패인지 구분이 안 됐다. 반면 사람이 읽는 문구는 이미 전부 '거절'
 * 이었다(버튼·다이얼로그·API 오류·메일·문서). 정본이 다수에 합류한 것이다.
 *
 * '반려' 는 도메인 의미로는 더 정확하지만(IN_PROGRESS → REJECTED 가 없어 "작업 취소" 가
 * 아니라 "접수 게이트에서 되돌림" 이다) 쓰지 않는다 — 한국어 관행상 보완 후 재제출을
 * 함의하는데 sr-state-machine 은 `REJECTED: []` 로 재요청을 봉인했다.
 * 재신청을 여는 날 다시 판단할 것.
 *
 * ⚠️ 이 문구는 액션 버튼 문구와 **같아졌다.** 상세 화면에는 '보류' 배지와 '보류'
 * 버튼이 공존한다(SRStatusActions.tsx:169). 텍스트로 배지를 겨냥하는 테스트는
 * 반드시 `data-testid="sr-status-badge"` 나 role 로 범위를 좁혀야 한다.
 */
export const statusLabels: Record<SRStatus, string> = {
  REQUESTED: '요청됨',
  INTAKE: '접수',
  IN_PROGRESS: '진행중',
  ON_HOLD: '보류',
  COMPLETED: '완료',
  CONFIRMED: '확인완료',
  REJECTED: '거절',
};

/**
 * 상태 문자열을 라벨로 옮긴다. 서버 응답은 직렬화를 거쳐 `string` 이므로
 * `statusLabels[x]` 를 직접 쓰면 타입이 걸리고, `noUncheckedIndexedAccess` 아래에서는
 * 모르는 값에 `undefined` 가 나와 **화면에 아무것도 안 뜬다**(감사 지적 사항).
 * 여기서 원문 폴백을 두어 최소한 무엇인지 보이게 한다.
 */
export function statusLabelOf(status: string): string {
  return statusLabels[status as SRStatus] ?? status;
}

// SR 우선순위 라벨
export const priorityLabels: Record<string, string> = {
  CRITICAL: '긴급',
  HIGH: '높음',
  MEDIUM: '보통',
  LOW: '낮음',
};

/** 상태·우선순위·마감 배지가 쓰는 Badge variant(의미색 — src/components/ui/badge.tsx). */
export type SRBadgeVariant =
  'default' | 'neutral' | 'info' | 'success' | 'successEmphasis' | 'warning' | 'caution' | 'danger';

/**
 * SR 상태 Badge variant — **모든 화면의 정본**. 화면은 이 맵을 직접 읽지 않고 `SRStatusBadge` 를 쓴다.
 *
 * 1단계(2026-09-18 소유자 결정 D16): 화면마다 따로 있던 사본을 이 맵으로 흡수했다.
 * 2단계(같은 결정, 소유자가 시안 A 를 고름): 7개 상태가 채움·테두리·빨강 세 모양뿐이라 적체를 색으로 거를 수
 * 없었다. 움직이는 일(진행중)만 파랑, 멈춘 일(보류)은 노랑, 끝난 일(완료·확인완료)은 초록, 거절은 빨강이다.
 * 요청됨은 색 없는 테두리, 접수는 회색 채움으로 '아직 손대기 전' 과 '받아 둠' 을 가른다. 확인완료는 완료와 같은
 * 초록에 테두리와 체크 아이콘(SRStatusBadge)을 더한다. 설계 근거는 LLD '상태별 색' 초안이다.
 */
export const statusBadgeVariants: Record<string, SRBadgeVariant> = {
  REQUESTED: 'neutral',
  INTAKE: 'default',
  IN_PROGRESS: 'info',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
  CONFIRMED: 'successEmphasis',
  REJECTED: 'danger',
};

/**
 * SR 우선순위 Badge variant — 정본(D16). 빨강은 긴급에만 쓰고 높음은 주황으로 뗀다 — 예전에는 빨강이 거절·긴급·
 * 높음·마감 임박에 모두 쓰여 빨강만으로는 무엇이 급한지 알 수 없었다. 낮음은 색 없는 테두리다.
 */
export const priorityBadgeVariants: Record<string, SRBadgeVariant> = {
  CRITICAL: 'danger',
  HIGH: 'caution',
  MEDIUM: 'default',
  LOW: 'neutral',
};

// 조회는 Map 으로 한다 — 객체 인덱싱은 'toString' 같은 프로토타입 키에 엉뚱한 값을 준다.
const STATUS_BADGE_VARIANTS = new Map(Object.entries(statusBadgeVariants));
const PRIORITY_BADGE_VARIANTS = new Map(Object.entries(priorityBadgeVariants));
const PRIORITY_LABELS = new Map(Object.entries(priorityLabels));

/** 상태 배지 variant. 모르는 값은 'neutral'(알약은 보이되 강조하지 않음). */
export function statusBadgeVariantOf(status: string | null | undefined): SRBadgeVariant {
  return (status && STATUS_BADGE_VARIANTS.get(status)) || 'neutral';
}

/** 우선순위 배지 variant. 모르는 값은 'neutral'. */
export function priorityBadgeVariantOf(priority: string | null | undefined): SRBadgeVariant {
  return (priority && PRIORITY_BADGE_VARIANTS.get(priority)) || 'neutral';
}

/** 우선순위 라벨. 모르는 값은 코드 그대로(숨기지 않는다). */
export function priorityLabelOf(priority: string | null | undefined): string {
  if (!priority) return '';
  return PRIORITY_LABELS.get(priority) ?? priority;
}

/**
 * 활동 metadata 가운데 내부 사용자만 보는 키 — 마감일 조정 사유가 담긴다(2026-09-18 소유자 결정 D9).
 * 서버는 고객에게 내려보낼 때 이 키를 지우고(policies.redactActivityForViewer), 활동 목록 화면은 값이
 * 있을 때만 보여 준다.
 */
export const INTERNAL_ACTIVITY_METADATA_KEY = 'internalReason';

/** 활동에 실린 내부 전용 사유. 고객에게는 서버가 지우므로 여기까지 오지 않는다. */
export function internalReasonOf(activity: { metadata?: unknown }): string | null {
  const metadata = activity.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  // 키 이름은 INTERNAL_ACTIVITY_METADATA_KEY 와 같다.
  const value = (metadata as { internalReason?: unknown }).internalReason;
  return typeof value === 'string' && value.trim() ? value : null;
}
