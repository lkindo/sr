"use client";

import { useSession } from "next-auth/react";

export function usePermissions() {
  const { data: session } = useSession();

  const hasPermission = (resource: string, action: string): boolean => {
    if (!session?.user?.permissions) return false;
    const permission = `${resource}.${action}`;
    return session.user.permissions.includes(permission);
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
    return hasRole("ADMIN");
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

