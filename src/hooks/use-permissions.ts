'use client';

import { useSession } from 'next-auth/react';

export function usePermissions() {
  const { data: session } = useSession();

  const hasPermission = (resource: string, action: string): boolean => {
    if (!session?.user?.permissions) return false;
    // 세션 토큰은 `${resource}:${action}` 로 담는다(src/auth.ts). 여기서는 `.` 로 조립해
    // 어떤 권한도 매칭되지 않았다 — 항상 false 를 반환하는 게이트였다. 지금은 호출처가
    // 전부 roles 를 쓰고 있어 드러나지 않았지만, 권한으로 게이트하는 순간 조용히 막힌다.
    const permission = `${resource}:${action}`.toUpperCase();
    return session.user.permissions.some((granted) => granted.toUpperCase() === permission);
  };

  const hasAnyPermission = (permissions: Array<{ resource: string; action: string }>): boolean => {
    if (!session?.user?.permissions) return false;
    return permissions.some((perm) => hasPermission(perm.resource, perm.action));
  };

  const hasAllPermissions = (permissions: Array<{ resource: string; action: string }>): boolean => {
    if (!session?.user?.permissions) return false;
    return permissions.every((perm) => hasPermission(perm.resource, perm.action));
  };

  const hasRole = (roleName: string): boolean => {
    if (!session?.user?.roles) return false;
    return session.user.roles.includes(roleName);
  };

  const hasAnyRole = (roleNames: string[]): boolean => {
    if (!session?.user?.roles) return false;
    return roleNames.some((role) => session.user.roles.includes(role));
  };

  const isAdmin = (): boolean => {
    return hasRole('ADMIN');
  };

  return {
    permissions: session?.user?.permissions || [],
    roles: session?.user?.roles || [],
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    hasAnyRole,
    isAdmin,
  };
}
