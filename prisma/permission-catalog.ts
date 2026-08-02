/**
 * 권한 카탈로그 — `Permission` 테이블의 유일한 원천.
 *
 * 앱 소스(`src/lib/permission-helpers.ts` 의 `PERMISSIONS`, `src/lib/sr-state-machine.ts` 의
 * `TRANSITION_PERMISSIONS`)가 검사하는 문자열은 전부 여기에 행이 있어야 한다. 없으면
 * RBAC 화면에 뜨지 않으므로 운영자가 부여할 방법이 없고, 그 권한을 요구하는 코드 경로는
 * ADMIN 단락을 제외하면 영구히 거부된다 — 존재하는 것처럼 보이지만 아무것도 하지 않는 통제.
 *
 * 실제로 그런 상태였다(감사 4.1). `prisma/seed.ts` 는 CLIENT_USER 에게
 * `action: { in: ['CREATE','READ','UPDATE_SELF'] }` 를 부여하려 했지만 `UPDATE_SELF` 행이
 * 없어 `findMany` 에서 조용히 빠졌고, 결과적으로 고객 사용자는 자기가 올린 SR 을 수정할 수
 * 없었다. `src/lib/__tests__/permission-catalog.test.ts` 가 이 드리프트를 막는다.
 *
 * 시드가 앱 소스에 의존하지 않는다는 원칙을 지키기 위해 이 파일은 `prisma/` 안에 두고
 * 어떤 것도 import 하지 않는다. 대조는 양쪽을 모두 읽을 수 있는 테스트가 담당한다.
 */
export const PERMISSION_CATALOG = [
  // SR 관련 권한
  { resource: 'SR', action: 'CREATE', description: 'SR 생성' },
  { resource: 'SR', action: 'READ', description: 'SR 조회' },
  { resource: 'SR', action: 'UPDATE', description: 'SR 수정' },
  { resource: 'SR', action: 'UPDATE_SELF', description: '본인이 요청한 SR 수정' },
  { resource: 'SR', action: 'DELETE', description: 'SR 삭제' },
  { resource: 'SR', action: 'ASSIGN', description: 'SR 담당자 할당' },
  { resource: 'SR', action: 'STATUS_CHANGE', description: 'SR 상태 변경' },
  { resource: 'SR', action: 'INTAKE', description: 'SR 접수(트리아지)' },
  { resource: 'SR', action: 'CONFIRM', description: 'SR 완료 확인 및 재오픈(고객 인수)' },

  // 고객사 관련 권한
  { resource: 'CLIENT', action: 'CREATE', description: '고객사 생성' },
  { resource: 'CLIENT', action: 'READ', description: '고객사 조회' },
  { resource: 'CLIENT', action: 'UPDATE', description: '고객사 수정' },
  { resource: 'CLIENT', action: 'DELETE', description: '고객사 삭제' },

  // 사용자 관련 권한
  { resource: 'USER', action: 'CREATE', description: '사용자 생성' },
  { resource: 'USER', action: 'READ', description: '사용자 조회' },
  { resource: 'USER', action: 'UPDATE', description: '사용자 수정' },
  { resource: 'USER', action: 'UPDATE_SELF', description: '본인 프로필 수정' },
  { resource: 'USER', action: 'DELETE', description: '사용자 삭제' },
  { resource: 'USER', action: 'ASSIGN_ROLE', description: '역할 할당' },

  // 역할 관련 권한
  { resource: 'ROLE', action: 'CREATE', description: '역할 생성' },
  { resource: 'ROLE', action: 'READ', description: '역할 조회' },
  { resource: 'ROLE', action: 'UPDATE', description: '역할 수정' },
  { resource: 'ROLE', action: 'DELETE', description: '역할 삭제' },
  { resource: 'ROLE', action: 'ASSIGN', description: '사용자에게 역할 부여' },
  { resource: 'ROLE', action: 'ASSIGN_PERMISSION', description: '권한 할당' },

  // 댓글 관련 권한
  { resource: 'COMMENT', action: 'CREATE', description: '댓글 생성' },
  { resource: 'COMMENT', action: 'READ', description: '댓글 조회' },
  { resource: 'COMMENT', action: 'UPDATE', description: '댓글 수정' },
  { resource: 'COMMENT', action: 'DELETE', description: '댓글 삭제' },

  // 첨부파일 관련 권한
  { resource: 'ATTACHMENT', action: 'CREATE', description: '첨부파일 업로드' },
  { resource: 'ATTACHMENT', action: 'READ', description: '첨부파일 조회' },
  { resource: 'ATTACHMENT', action: 'DELETE', description: '첨부파일 삭제' },

  // 알림 관련 권한
  { resource: 'NOTIFICATION', action: 'READ', description: '알림 조회' },
  { resource: 'NOTIFICATION', action: 'UPDATE', description: '알림 상태 변경' },

  // 대시보드 관련 권한
  { resource: 'DASHBOARD', action: 'READ', description: '대시보드 조회' },
  { resource: 'DASHBOARD', action: 'ANALYTICS', description: '분석 데이터 조회' },
] as const;

/** 세션 토큰이 담는 형태(`src/auth.ts`)와 동일한 `RESOURCE:ACTION` 문자열. */
export const permissionKey = (p: { resource: string; action: string }) =>
  `${p.resource}:${p.action}`;
