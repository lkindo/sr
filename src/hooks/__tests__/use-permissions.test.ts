import { useSession } from 'next-auth/react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePermissions } from '../use-permissions';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

const mockedUseSession = vi.mocked(useSession);

/**
 * 이 테스트는 원래 `permissions: ['sr.view', ...]` 라는 **실제로는 존재하지 않는 형태**를
 * 세션에 넣고 `hasPermission` 이 점(.)으로 조립하는 동작을 정상으로 못 박고 있었다.
 * `src/auth.ts` 는 `${resource}:${action}` 를 대문자로 담으므로, 프로덕션 세션에서는
 * 이 헬퍼가 **항상 false** 였다. 픽스처를 실제 세션 형태로 바꾼다.
 */
describe('usePermissions', () => {
  beforeEach(() => {
    mockedUseSession.mockReset();
  });

  it('세션 권한과 역할을 기반으로 헬퍼를 제공한다', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: {
          permissions: ['SR:READ', 'SR:UPDATE', 'USER:UPDATE'],
          roles: ['ADMIN', 'MANAGER'],
        },
      },
    } as any);

    const { result } = renderHook(() => usePermissions());

    expect(result.current.permissions).toEqual(['SR:READ', 'SR:UPDATE', 'USER:UPDATE']);
    expect(result.current.roles).toEqual(['ADMIN', 'MANAGER']);
    expect(result.current.hasPermission('SR', 'READ')).toBe(true);
    expect(result.current.hasPermission('SR', 'DELETE')).toBe(false);
    // 호출부가 소문자로 넘겨도 세션 값과 매칭돼야 한다(비교는 대소문자 무시).
    expect(result.current.hasPermission('sr', 'read')).toBe(true);
    expect(
      result.current.hasAnyPermission([
        { resource: 'SR', action: 'DELETE' },
        { resource: 'USER', action: 'UPDATE' },
      ])
    ).toBe(true);
    expect(
      result.current.hasAllPermissions([
        { resource: 'SR', action: 'READ' },
        { resource: 'SR', action: 'UPDATE' },
      ])
    ).toBe(true);
    expect(result.current.hasRole('ADMIN')).toBe(true);
    expect(result.current.hasAnyRole(['OPERATOR', 'MANAGER'])).toBe(true);
    expect(result.current.isAdmin()).toBe(true);
  });

  it('세션이 없으면 안전한 기본값을 사용한다', () => {
    mockedUseSession.mockReturnValue({ data: null } as any);

    const { result } = renderHook(() => usePermissions());

    expect(result.current.permissions).toEqual([]);
    expect(result.current.roles).toEqual([]);
    expect(result.current.hasPermission('SR', 'READ')).toBe(false);
    expect(result.current.hasAnyPermission([{ resource: 'SR', action: 'READ' }])).toBe(false);
    expect(result.current.hasAllPermissions([])).toBe(false);
    expect(result.current.hasRole('ADMIN')).toBe(false);
    expect(result.current.hasAnyRole(['USER'])).toBe(false);
    expect(result.current.isAdmin()).toBe(false);
  });
});
