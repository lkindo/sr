import { SR } from "@prisma/client"
import { AuthenticatedUser } from "@/types/session"
import { ForbiddenError } from "@/lib/errors"
import { PERMISSIONS, hasPermissionFlag } from "@/lib/permission-helpers"

export class SRPolicy {
  canCreate(user: AuthenticatedUser): boolean {
    return hasPermissionFlag(user, PERMISSIONS.SR.CREATE)
  }

  canRead(user: AuthenticatedUser, sr: SR): boolean {
    const isAdmin = user.roles.includes("ADMIN")
    const canViewAll = hasPermissionFlag(user, PERMISSIONS.SR.READ)

    // 요청자는 본인이 속한 고객사의 SR만 조회 가능
    const belongsToClient = user.clientIds?.includes(sr.clientId) ?? false;
    const isRequester = sr.requesterId === user.id &&
      hasPermissionFlag(user, PERMISSIONS.SR.UPDATE_SELF) &&
      belongsToClient;

    return isAdmin || canViewAll || isRequester
  }

  canUpdate(user: AuthenticatedUser, sr: SR): boolean {
    const isAdmin = user.roles.includes("ADMIN")
    const hasUpdate = hasPermissionFlag(user, PERMISSIONS.SR.UPDATE)
    const isRequester = sr.requesterId === user.id && hasPermissionFlag(user, PERMISSIONS.SR.UPDATE_SELF)
    return Boolean(isAdmin || hasUpdate || isRequester)
  }

  canDelete(user: AuthenticatedUser): boolean {
    return hasPermissionFlag(user, PERMISSIONS.SR.DELETE)
  }

  ensureCanCreate(user: AuthenticatedUser): void {
    if (!this.canCreate(user)) {
      throw new ForbiddenError("SR 생성 권한이 없습니다.")
    }
  }

  ensureCanRead(user: AuthenticatedUser, sr: SR): void {
    if (!this.canRead(user, sr)) {
      throw new ForbiddenError("SR 조회 권한이 없습니다.")
    }
  }

  ensureCanUpdate(user: AuthenticatedUser, sr: SR): void {
    if (!this.canUpdate(user, sr)) {
      throw new ForbiddenError("SR 수정 권한이 없습니다.")
    }
  }

  ensureCanDelete(user: AuthenticatedUser): void {
    if (!this.canDelete(user)) {
      throw new ForbiddenError("SR 삭제 권한이 없습니다.")
    }
  }
}
