/**
 * 역할 목록 화면이 공유하는 Role 형태.
 *
 * `RoleTable.tsx:7-15` 와 `RoleMobileList.tsx:8-16` 에 글자까지 동일하게 복제돼 있던
 * 인터페이스를 그대로 옮긴 것이다 — 같은 데이터를 데스크톱/모바일 두 벌로 그리는
 * 자리라 형태가 같은 것이 우연이 아니다.
 *
 * **다이얼로그들(RoleDialog/DeleteRoleDialog/PermissionBoard)은 여기에 묶지 않는다.**
 * 셋은 각자 필요한 필드만 요구하는 더 좁은 타입을 쓰는데, 그것까지 이 타입으로
 * 통합하려면 `permissions` 를 optional 로 낮춰야 한다. 그러면 목록에서 권한 개수를
 * 셀 때 `?? 0` 폴백이 필요해지고, "권한을 못 받았다"와 "권한이 0개다"가 구분되지 않는다.
 * 중복을 지우는 대가가 타입을 느슨하게 만드는 것이면 그 중복은 남기는 편이 낫다.
 */
export interface RoleItem {
  id: string;
  name: string;
  description?: string;
  permissions: { id: string; permission: any }[];
  _count?: {
    users: number;
  };
}
