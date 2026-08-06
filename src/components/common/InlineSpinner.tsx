/**
 * 인라인 로딩 스피너.
 *
 * 여섯 곳(`ClientTable`, `ClientMobileList`, `UserTable`, `UserMobileList`,
 * `RegisterForm`, `OrganizationTree`)에 아래 한 줄이 글자까지 동일하게 복제돼 있었다:
 *
 *   <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
 *
 * **감싸는 컨테이너와 문구는 여기에 넣지 않는다.** 여섯 곳의 바깥 구조가 제각각이라
 * (테이블 셀 / 카드 / 폼 필드 / 트리 노드, 문구도 '로딩 중...' · '고객사 목록 로딩 중...' ·
 * '사용자 정보 로딩 중...' 로 다름) 컨테이너까지 공통화하면 여섯 곳 중 어디에도 맞지 않는
 * 기본값을 만들게 된다. 실제 공통분모는 이 원 하나뿐이다.
 *
 * lucide `Loader2` 로 바꾸지 말 것 — 모양이 다른 스피너이고, 여섯 곳이 함께 바뀐다.
 */
export function InlineSpinner() {
  return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>;
}
