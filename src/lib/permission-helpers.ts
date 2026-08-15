import { AuthenticatedUser } from '@/types/session';

export const PERMISSIONS = {
  SR: {
    CREATE: 'SR:CREATE',
    READ: 'SR:READ',
    UPDATE: 'SR:UPDATE',
    UPDATE_SELF: 'SR:UPDATE_SELF',
    DELETE: 'SR:DELETE',
  },
  CLIENT: {
    CREATE: 'CLIENT:CREATE',
    READ: 'CLIENT:READ',
    UPDATE: 'CLIENT:UPDATE',
    DELETE: 'CLIENT:DELETE',
  },
  USER: {
    CREATE: 'USER:CREATE',
    READ: 'USER:READ',
    UPDATE: 'USER:UPDATE',
    UPDATE_SELF: 'USER:UPDATE_SELF',
    DELETE: 'USER:DELETE',
  },
  ROLE: {
    CREATE: 'ROLE:CREATE',
    READ: 'ROLE:READ',
    UPDATE: 'ROLE:UPDATE',
    DELETE: 'ROLE:DELETE',
    ASSIGN: 'ROLE:ASSIGN',
    // 역할에 권한을 붙이거나 떼는 행위. `role.actions.ts` 가 오랫동안
    // `'role:update_permissions'` 라는 **카탈로그에 없는 문자열**을 요구해서,
    // 그 액션은 ADMIN 을 제외한 누구에게도 부여될 수 없는 죽은 통제였다(감사 D-20).
    ASSIGN_PERMISSION: 'ROLE:ASSIGN_PERMISSION',
  },
  /**
   * 댓글·첨부 권한은 카탈로그에 있고 다섯 역할 모두에 부여되지만, 오랫동안
   * **어떤 정책 함수도 검사하지 않았다**(감사 4.1). 관리자가 RBAC 화면에서
   * `ATTACHMENT:CREATE` 를 회수해도 동작이 전혀 바뀌지 않으면서 UI 는 제거된 것으로
   * 표시했다 — 없느니만 못한, 조용히 무효한 통제였다.
   *
   * 여기 올린 것은 **실제로 강제되는 것만**이다. 나머지(`COMMENT:UPDATE/DELETE`,
   * `ATTACHMENT:DELETE`)는 의도적으로 뺐다:
   *   - 댓글 수정·삭제는 기능 자체가 없다(`comments/route.ts` 는 GET/POST 만 export
   *     하고 개별 댓글 라우트가 없다). 지킬 대상이 없는 권한이다.
   *   - `ATTACHMENT:DELETE` 는 시드에서 CLIENT_USER 에게 부여되지 않는다. 지금 강제하면
   *     고객사 사용자가 자기가 올린 파일을 지우지 못하게 되는 **정책 변경**이 되므로
   *     소유자 판단이 필요하다. 현재는 `ensureCanUpdateSR` 이 삭제를 게이트한다.
   * 이 셋은 카탈로그에서 제거할지 강제할지 결정하기 전까지 여전히 무효 상태다.
   */
  COMMENT: {
    CREATE: 'COMMENT:CREATE',
  },
  ATTACHMENT: {
    CREATE: 'ATTACHMENT:CREATE',
  },
} as const;

export function hasPermissionFlag(user: AuthenticatedUser, permission: string) {
  return user.permissions?.includes(permission) ?? false;
}
