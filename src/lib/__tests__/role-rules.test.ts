import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ROLE_NAMES,
  isCanonicalRole,
  isImmutableRole,
  isReservedRoleName,
} from '@/lib/role-rules';

describe('role-rules — 기본 역할 보호(헌법 §1.4)', () => {
  it('기본 역할은 시드가 만드는 다섯 역할이다', () => {
    expect([...CANONICAL_ROLE_NAMES]).toEqual([
      'ADMIN',
      'MANAGER',
      'ENGINEER',
      'CLIENT_ADMIN',
      'CLIENT_USER',
    ]);
  });

  it('isCanonicalRole 은 저장된 이름을 그대로 비교한다', () => {
    expect(isCanonicalRole('MANAGER')).toBe(true);
    // 예전에 만들어진 소문자 커스텀 역할은 기본 역할이 아니다 — 인가는 대소문자를 구분해 비교한다.
    expect(isCanonicalRole('manager')).toBe(false);
    expect(isCanonicalRole('USER')).toBe(false);
  });

  it('isReservedRoleName 은 새 이름을 대소문자·앞뒤 공백 무시로 본다', () => {
    expect(isReservedRoleName('manager')).toBe(true);
    expect(isReservedRoleName('  Client_Admin ')).toBe(true);
    expect(isReservedRoleName('MANAGER_LEAD')).toBe(false);
    expect(isReservedRoleName('GUEST')).toBe(false);
  });

  it('설명·권한까지 잠긴 역할은 ADMIN 하나다', () => {
    expect(isImmutableRole('ADMIN')).toBe(true);
    expect(isImmutableRole('MANAGER')).toBe(false);
  });
});
