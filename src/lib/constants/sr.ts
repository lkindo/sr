/**
 * SR 관련 공통 상수 정의
 */
import type { SRStatus } from '@prisma/client';

/**
 * SR 상태 라벨 — **정본**.
 *
 * `Record<SRStatus, string>` 으로 못박는다. 예전에는 `Record<string, string>` 이라
 * 상태가 추가되거나 키를 잘못 적어도 컴파일이 통과했다. 아이러니하게도 사본들
 * (my-requests, e2e/21, SRActivities)은 전부 enum 으로 타입이 걸려 있었고
 * **정본만 무방비**였다. 이제 SRStatus 가 늘면 여기서 먼저 깨진다.
 *
 * `import type` 이므로 런타임 의존이 생기지 않는다(빌드 시 elide) — 이 모듈은
 * 클라이언트 컴포넌트도 import 한다.
 *
 * ON_HOLD 는 '보류' 다(2026-08-09 확정). 예전에는 여기만 '대기' 였고 사본 3곳
 * (my-requests:92, email.service:130, UserReassignDialog:61)은 이미 '보류' 였다.
 * 그래서 같은 상태가 화면에 따라 '대기'/'보류' 두 이름으로 보였다 — 목록 카드에서
 * '보류' 를 보고 상세로 들어가면 '대기' 가 떴다.
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
  REJECTED: '거부',
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

// SR 상태 Badge variant 맵.
//
// 이 값들은 통합 전 세 벌(components/srs/constants.ts, clients/[id]/page.tsx,
// dashboard/page.tsx)이 글자까지 동일했던 것을 그대로 옮긴 것이다. 통합의 전제가
// "세 사본이 같다"였으므로 값을 바꾸면 통합이 아니라 리디자인이 된다 —
// 배지 색을 조정하려면 별도 커밋에서 네 화면을 함께 보고 결정할 것.
//
// `my-requests/page.tsx` 의 네 번째 사본은 의도적으로 합치지 않았다. 값에 'outline'
// 이 있고 라벨 문구도 달라서, 화면별 차이가 의도인지 표류인지 소유자 판단이 필요하다.
export const statusBadgeVariants: Record<string, 'default' | 'secondary' | 'destructive'> = {
  REQUESTED: 'secondary',
  INTAKE: 'default',
  IN_PROGRESS: 'default',
  ON_HOLD: 'secondary',
  COMPLETED: 'default',
  CONFIRMED: 'default',
  REJECTED: 'destructive',
};

// SR 우선순위 Badge variant 맵. 위와 같은 근거로 통합 전 값을 보존한다.
// 특히 HIGH 는 'destructive' 다 — CRITICAL 과 같은 강조를 주는 것이 원래 동작이다.
export const priorityBadgeVariants: Record<string, 'default' | 'secondary' | 'destructive'> = {
  CRITICAL: 'destructive',
  HIGH: 'destructive',
  MEDIUM: 'default',
  LOW: 'secondary',
};
