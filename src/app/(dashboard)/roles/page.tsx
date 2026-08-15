import { auth } from '@/auth';
import { canReadRole } from '@/lib/policies';
import { RoleService } from '@/services/role.service';
import type { RoleItem } from '@/types/role';

import RolesClient from './RolesClient';

/**
 * 역할 관리 — **서버 컴포넌트**.
 *
 * fe-rules §1 은 "데이터 페칭과 민감한 로직은 RSC 로 설계하고, `'use client'` 는 상호작용이
 * 필요한 리프 컴포넌트에만" 이라고 규정한다. 이 화면은 오랫동안 최상단에 `'use client'` 를
 * 달고 목록 전체를 브라우저에서 가져왔다 — 열 때마다 스피너가 한 번 돌고, 목록 로직이
 * 번들에 실렸다.
 *
 * 이제 서버가 서비스 계층을 직접 호출해 첫 화면을 채우고, 상호작용(다이얼로그·수정·삭제)만
 * `RolesClient` 가 맡는다. 대조군은 `src/app/(dashboard)/srs/page.tsx` 다.
 *
 * **인가는 API 와 같은 술어로 판정한다.** `canReadRole` 은 `/api/roles` 가 쓰는 것과 같은
 * 함수다 — 화면과 서버가 다른 규칙을 쓰면 목록에는 보이는데 조작은 403 인 상태가 생긴다.
 * 여기서 던지지 않고 `null` 을 내려보내는 이유는, 권한 없는 사용자에게 빈 목록 대신
 * 전용 안내를 보여 주는 기존 동작을 그대로 유지하기 위해서다.
 */
export default async function RolesPage() {
  const session = await auth();

  const canRead = session?.user ? canReadRole(session.user) : false;
  if (!canRead) {
    return <RolesClient initialRoles={null} />;
  }

  const roleService = new RoleService();
  const roles = await roleService.getAllRoles();

  // 클라이언트 쿼리(`apiGet<Role[]>('/api/roles')`)가 돌려주는 모양과 맞춘다.
  // 권한 배열이 없을 수 있다는 전제도 그대로 가져온다.
  const initialRoles = roles.map((role) => ({
    ...role,
    permissions: role.permissions || [],
  })) as unknown as RoleItem[];

  return <RolesClient initialRoles={initialRoles} />;
}
