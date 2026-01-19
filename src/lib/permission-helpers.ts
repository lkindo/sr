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
  },
} as const;

export function hasPermissionFlag(user: AuthenticatedUser, permission: string) {
  return user.permissions?.includes(permission) ?? false;
}

export function hasAnyPermissionFlag(user: AuthenticatedUser, permissions: string[]) {
  return permissions.some((permission) => hasPermissionFlag(user, permission));
}

export function hasAllPermissionFlags(user: AuthenticatedUser, permissions: string[]) {
  return permissions.every((permission) => hasPermissionFlag(user, permission));
}
