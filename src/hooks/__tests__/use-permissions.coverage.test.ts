import { useSession } from 'next-auth/react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePermissions } from '../use-permissions';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

const mockedUseSession = vi.mocked(useSession);

describe('usePermissions (coverage)', () => {
  beforeEach(() => {
    mockedUseSession.mockReset();
  });

  it('데이터가 있을 때 모든 헬퍼의 true/false 분기를 다룬다', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: {
          permissions: ['sr.view', 'sr.edit'],
          roles: ['OPERATOR'],
        },
      },
    } as any);

    const { result } = renderHook(() => usePermissions());

    // returned arrays
    expect(result.current.permissions).toEqual(['sr.view', 'sr.edit']);
    expect(result.current.roles).toEqual(['OPERATOR']);

    // hasPermission true + false
    expect(result.current.hasPermission('sr', 'view')).toBe(true);
    expect(result.current.hasPermission('sr', 'delete')).toBe(false);

    // hasAnyPermission true + false
    expect(
      result.current.hasAnyPermission([
        { resource: 'sr', action: 'delete' },
        { resource: 'sr', action: 'edit' },
      ])
    ).toBe(true);
    expect(result.current.hasAnyPermission([{ resource: 'user', action: 'manage' }])).toBe(false);

    // hasAllPermissions true + false
    expect(
      result.current.hasAllPermissions([
        { resource: 'sr', action: 'view' },
        { resource: 'sr', action: 'edit' },
      ])
    ).toBe(true);
    expect(
      result.current.hasAllPermissions([
        { resource: 'sr', action: 'view' },
        { resource: 'sr', action: 'delete' },
      ])
    ).toBe(false);

    // hasRole true + false
    expect(result.current.hasRole('OPERATOR')).toBe(true);
    expect(result.current.hasRole('ADMIN')).toBe(false);

    // hasAnyRole true + false
    expect(result.current.hasAnyRole(['ADMIN', 'OPERATOR'])).toBe(true);
    expect(result.current.hasAnyRole(['ADMIN', 'MANAGER'])).toBe(false);

    // isAdmin false branch (no ADMIN role)
    expect(result.current.isAdmin()).toBe(false);
  });

  it('ADMIN 역할이 있으면 isAdmin이 true를 반환한다', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: {
          permissions: [],
          roles: ['ADMIN'],
        },
      },
    } as any);

    const { result } = renderHook(() => usePermissions());

    expect(result.current.isAdmin()).toBe(true);
    expect(result.current.hasRole('ADMIN')).toBe(true);
    // empty permissions array but defined -> some/every still operate
    expect(result.current.hasAnyPermission([{ resource: 'sr', action: 'view' }])).toBe(false);
    expect(result.current.hasAllPermissions([])).toBe(true); // every on empty session perms list
  });

  it('세션 로딩 상태(undefined data)에서 안전한 기본값을 반환한다', () => {
    mockedUseSession.mockReturnValue({ data: undefined } as any);

    const { result } = renderHook(() => usePermissions());

    expect(result.current.permissions).toEqual([]);
    expect(result.current.roles).toEqual([]);
    expect(result.current.hasPermission('sr', 'view')).toBe(false);
    expect(result.current.hasAnyPermission([{ resource: 'sr', action: 'view' }])).toBe(false);
    expect(result.current.hasAllPermissions([{ resource: 'sr', action: 'view' }])).toBe(false);
    expect(result.current.hasRole('ADMIN')).toBe(false);
    expect(result.current.hasAnyRole(['ADMIN'])).toBe(false);
    expect(result.current.isAdmin()).toBe(false);
  });

  it('user에 permissions/roles 필드가 없으면 가드 분기를 탄다', () => {
    mockedUseSession.mockReturnValue({
      data: { user: { id: '1' } },
    } as any);

    const { result } = renderHook(() => usePermissions());

    expect(result.current.permissions).toEqual([]);
    expect(result.current.roles).toEqual([]);
    expect(result.current.hasPermission('sr', 'view')).toBe(false);
    expect(result.current.hasAnyPermission([{ resource: 'sr', action: 'view' }])).toBe(false);
    expect(result.current.hasAllPermissions([{ resource: 'sr', action: 'view' }])).toBe(false);
    expect(result.current.hasRole('OPERATOR')).toBe(false);
    expect(result.current.hasAnyRole(['OPERATOR'])).toBe(false);
    expect(result.current.isAdmin()).toBe(false);
  });
});
