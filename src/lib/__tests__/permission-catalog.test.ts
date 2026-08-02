import { describe, expect, it } from 'vitest';

import { PERMISSION_CATALOG, permissionKey } from '../../../prisma/permission-catalog';
import { PERMISSIONS } from '../permission-helpers';
import { TRANSITION_PERMISSIONS } from '../sr-state-machine';

/**
 * 감사 4.1 회귀 테스트 — 권한 카탈로그 드리프트.
 *
 * `Permission` 행은 `prisma/permission-catalog.ts` 에서만 생성된다. 정책 코드가 검사하는
 * 문자열에 대응하는 행이 없으면 그 권한은 RBAC 화면에 뜨지 않고, 따라서 운영자가 부여할
 * 방법이 없으며, 그것을 요구하는 경로는 ADMIN 단락을 빼면 영구히 거부된다.
 *
 * 실제로 `SR:UPDATE_SELF`, `USER:UPDATE_SELF`, `ROLE:ASSIGN` 이 그 상태였다. 시드는
 * CLIENT_USER 에게 `action: { in: [..., 'UPDATE_SELF'] }` 를 부여하려 했지만 존재하지 않는
 * 행에 대한 `findMany` 라 조용히 빠졌고, 고객 사용자는 자기가 올린 SR 을 수정할 수 없었다.
 * 부여 코드가 그대로 남아 있었기 때문에 코드만 읽어서는 드러나지 않았다.
 */

const catalogKeys = new Set(PERMISSION_CATALOG.map(permissionKey));

describe('권한 카탈로그 ↔ 정책 코드', () => {
  it('PERMISSIONS 의 모든 값이 카탈로그에 존재한다', () => {
    const missing = Object.values(PERMISSIONS)
      .flatMap((group) => Object.values(group))
      .filter((permission) => !catalogKeys.has(permission));

    expect(missing, `카탈로그에 없는 권한: ${missing.join(', ')}`).toEqual([]);
  });

  it('상태 전이가 요구하는 모든 권한이 카탈로그에 존재한다', () => {
    const missing = Object.values(TRANSITION_PERMISSIONS)
      .flatMap((targets) => Object.values(targets))
      .flat()
      .filter((permission) => !catalogKeys.has(permission));

    expect(missing, `카탈로그에 없는 전이 권한: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('권한 카탈로그 자체', () => {
  it('RESOURCE:ACTION 키가 중복되지 않는다', () => {
    // Permission 테이블은 (resource, action) 이 unique 다. 중복이 있으면 시드가 깨진다.
    expect(catalogKeys.size).toBe(PERMISSION_CATALOG.length);
  });

  it('resource·action 은 대문자 SNAKE_CASE 다', () => {
    // 세션 토큰(src/auth.ts)이 `${resource}:${action}` 를 그대로 담고, 전이 검사는
    // 이를 대문자로 비교한다. 소문자 행이 섞이면 비교가 조용히 어긋난다.
    for (const permission of PERMISSION_CATALOG) {
      expect(permission.resource).toMatch(/^[A-Z][A-Z_]*$/);
      expect(permission.action).toMatch(/^[A-Z][A-Z_]*$/);
      expect(permission.description.length).toBeGreaterThan(0);
    }
  });
});
