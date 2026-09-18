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

/** 상태·우선순위 배지가 쓰는 Badge variant. */
type SRBadgeVariant = 'default' | 'destructive' | 'outline';

/**
 * SR 상태 Badge variant — **모든 화면의 정본**(2026-09-18 소유자 결정 D16 1단계).
 *
 * 예전에는 SR 상세·상태 타임라인·내 요청·사용자 재배정 대화상자가 사본을 따로 들고 있었고, 내 요청 사본은 값이
 * 달라 같은 '완료' 가 목록에서는 테두리 배지, 상세에서는 채움 배지로 보였다. 사본을 모두 이 맵으로 흡수했다.
 *
 * REQUESTED·ON_HOLD 는 예전 'secondary' 였는데 그 배경(`--secondary` #141414)이 카드(`--card` #141414)와 같아
 * 카드·표 위에서 알약이 보이지 않고 글자만 떠 있었다. 테두리가 보이는 'outline' 으로 바꿨다.
 * 상태별 의미색(파랑·초록·주황 등)은 2단계에서 소유자가 시안을 본 뒤 정한다.
 */
export const statusBadgeVariants: Record<string, SRBadgeVariant> = {
  REQUESTED: 'outline',
  INTAKE: 'default',
  IN_PROGRESS: 'default',
  ON_HOLD: 'outline',
  COMPLETED: 'default',
  CONFIRMED: 'default',
  REJECTED: 'destructive',
};

/**
 * SR 우선순위 Badge variant — 정본(D16 1단계). 사본(SR 상세·내 요청·접수 카드 두 곳·재배정 대화상자)을 흡수했다.
 * HIGH 는 'destructive' 다 — CRITICAL 과 같은 강조를 주는 것이 원래 동작이다.
 * LOW 는 위 상태와 같은 이유(카드와 같은 배경)로 'secondary' 에서 'outline' 으로 바꿨다.
 */
export const priorityBadgeVariants: Record<string, SRBadgeVariant> = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'default',
  LOW: 'outline',
};

// 조회는 Map 으로 한다 — 객체 인덱싱은 'toString' 같은 프로토타입 키에 엉뚱한 값을 준다.
const STATUS_BADGE_VARIANTS = new Map(Object.entries(statusBadgeVariants));
const PRIORITY_BADGE_VARIANTS = new Map(Object.entries(priorityBadgeVariants));
const PRIORITY_LABELS = new Map(Object.entries(priorityLabels));

/** 상태 배지 variant. 모르는 값은 'outline'(알약은 보이되 강조하지 않음). */
export function statusBadgeVariantOf(status: string | null | undefined): SRBadgeVariant {
  return (status && STATUS_BADGE_VARIANTS.get(status)) || 'outline';
}

/** 우선순위 배지 variant. 모르는 값은 'outline'. */
export function priorityBadgeVariantOf(priority: string | null | undefined): SRBadgeVariant {
  return (priority && PRIORITY_BADGE_VARIANTS.get(priority)) || 'outline';
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
