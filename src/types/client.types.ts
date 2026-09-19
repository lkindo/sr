/**
 * 고객사 최소 표현.
 *
 * 선택 드롭다운·뱃지처럼 "고객사를 고르거나 이름만 보여주는" 화면이 공통으로 쓰는 3필드다.
 * Prisma 의 `Client` 모델과 이름이 겹치지 않도록 `ClientSummary` 로 둔다.
 * (상세 화면이 필요로 하는 연락처·계약기간 등은 이 타입에 얹지 않는다 — 화면별 상세 타입은
 *  해당 화면에 두고, 여기에는 모든 소비자가 실제로 쓰는 교집합만 남긴다.)
 */
export interface ClientSummary {
  id: string;
  name: string;
  code: string;
}

/**
 * 고객사 화면을 보는 사람의 범위 — GET /api/clients 와 /api/clients/[id] 의 `viewerScope`.
 * 'assigned' 는 담당자 스코프 사용자(ENGINEER)다. 사용자 명부를 받지 않고, SR 숫자는 자기 배정분이다
 * (헌법 §1.2, policies.canViewClientRoster).
 */
export type ClientViewerScope = 'all' | 'assigned';
