import { AuthenticatedUser } from "@/types/session"

export const PERMISSIONS = {
  SR: {
    CREATE: "SR:CREATE",
    READ: "SR:READ",
    UPDATE: "SR:UPDATE",
    UPDATE_SELF: "SR:UPDATE_SELF",
    DELETE: "SR:DELETE",
  },
} as const

export function hasPermissionFlag(user: AuthenticatedUser, permission: string) {
  return user.permissions?.includes(permission) ?? false
}

export function hasAnyPermissionFlag(user: AuthenticatedUser, permissions: string[]) {
  return permissions.some((permission) => hasPermissionFlag(user, permission))
}

export function hasAllPermissionFlags(user: AuthenticatedUser, permissions: string[]) {
  return permissions.every((permission) => hasPermissionFlag(user, permission))
}

