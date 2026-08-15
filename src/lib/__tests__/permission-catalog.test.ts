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

/**
 * 감사 D-20 회귀 방어 — **소스에 흩어진 권한 리터럴**.
 *
 * 위 스위트는 `PERMISSIONS` 상수와 전이표만 검사했다. 그런데 정책 코드가 검사하는
 * 문자열은 상수를 거치지 않고 호출부에 직접 적힐 수도 있고, 실제로 그랬다 —
 * `role.actions.ts` 가 `authenticateAndAuthorize('role:update_permissions')` 를 요구했는데
 * 카탈로그의 실제 값은 `ROLE:ASSIGN_PERMISSION` 이었다.
 *
 * 비교는 양쪽을 대문자로 정규화하므로 그 문자열은 `ROLE:UPDATE_PERMISSIONS` 가 되고,
 * 그런 행은 존재하지 않는다. 즉 **ADMIN 단락을 제외한 누구도 역할 권한을 편집할 수
 * 없는** 죽은 통제였다. 상수만 검사해서는 이 종류를 절대 못 잡는다.
 */
describe('소스에 직접 적힌 권한 리터럴', () => {
  it('authenticateAndAuthorize 리터럴은 전부 카탈로그에 있다', async () => {
    const { readFileSync, readdirSync } = await import('fs');
    const { join } = await import('path');

    const actionsDir = join(process.cwd(), 'src', 'actions');
    const files = readdirSync(actionsDir).filter((name) => name.endsWith('.ts'));

    /** `authenticateAndAuthorize('resource:action')` 의 인용 부호 인자만 뽑는다. */
    const literalPattern = /authenticateAndAuthorize\(\s*['"]([^'"]+)['"]\s*\)/g;

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(actionsDir, file), 'utf8');
      for (const match of source.matchAll(literalPattern)) {
        const literal = match[1]!;
        // 비교는 대문자로 정규화된다(permission.service.checkPermission).
        if (!catalogKeys.has(literal.toUpperCase())) {
          offenders.push(`${file}: '${literal}'`);
        }
      }
    }

    expect(
      offenders,
      `카탈로그에 없는 권한 리터럴 — 이 경로는 ADMIN 외 누구도 통과할 수 없다:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
