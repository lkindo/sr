/**
 * SR 관련 공통 상수 정의
 */

// SR 상태 라벨
export const statusLabels: Record<string, string> = {
  REQUESTED: '요청됨',
  INTAKE: '접수',
  IN_PROGRESS: '진행중',
  ON_HOLD: '대기',
  COMPLETED: '완료',
  CONFIRMED: '확인완료',
  REJECTED: '거부',
};

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
