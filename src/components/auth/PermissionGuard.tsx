'use client';

import { ReactNode } from 'react';

import { usePermissions } from '@/hooks/use-permissions';

interface PermissionGuardProps {
  children: ReactNode;
  resource?: string;
  action?: string;
  permissions?: Array<{ resource: string; action: string }>;
  requireAll?: boolean;
  role?: string;
  roles?: string[];
  fallback?: ReactNode;
}

export function PermissionGuard({
  children,
  resource,
  action,
  permissions,
  requireAll = false,
  role,
  roles,
  fallback = null,
}: PermissionGuardProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, hasRole, hasAnyRole } =
    usePermissions();

  let hasAccess = false;

  // 역할 체크
  if (role) {
    hasAccess = hasRole(role);
  } else if (roles && roles.length > 0) {
    hasAccess = hasAnyRole(roles);
  }
  // 권한 체크
  else if (resource && action) {
    hasAccess = hasPermission(resource, action);
  } else if (permissions && permissions.length > 0) {
    hasAccess = requireAll ? hasAllPermissions(permissions) : hasAnyPermission(permissions);
  }
  // 아무 조건도 없으면 접근 허용
  else {
    hasAccess = true;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
