/**
 * User (사용자) Policy
 *
 * 사용자 리소스에 대한 권한 정책을 정의합니다.
 */

import { User } from "@prisma/client";
import { AuthenticatedUser } from "@/types/session";
import { ForbiddenError } from "@/lib/errors";
import { PERMISSIONS, hasPermissionFlag } from "@/lib/permission-helpers";

export class UserPolicy {
  /**
   * 사용자 생성 권한 확인
   *
   * 사용자 생성은 ADMIN만 가능
   */
  canCreate(user: AuthenticatedUser): boolean {
    return (
      user.roles.includes("ADMIN") ||
      hasPermissionFlag(user, PERMISSIONS.USER.CREATE)
    );
  }

  /**
   * 사용자 조회 권한 확인
   *
   * 조회 가능한 경우:
   * - ADMIN 역할
   * - USER:READ 권한 보유
   * - 본인 조회 시
   */
  canRead(user: AuthenticatedUser, targetUser?: User): boolean {
    const isAdmin = user.roles.includes("ADMIN");
    const canViewAll = hasPermissionFlag(user, PERMISSIONS.USER.READ);

    // 특정 사용자 조회 시
    if (targetUser) {
      const isSelf = targetUser.id === user.id;
      return isAdmin || canViewAll || isSelf;
    }

    // 전체 사용자 목록 조회 시
    return isAdmin || canViewAll;
  }

  /**
   * 사용자 수정 권한 확인
   *
   * 수정 가능한 경우:
   * - ADMIN 역할
   * - USER:UPDATE 권한 보유
   * - 본인 수정 시 USER:UPDATE_SELF 권한 보유
   */
  canUpdate(user: AuthenticatedUser, targetUser: User): boolean {
    const isAdmin = user.roles.includes("ADMIN");
    const hasUpdate = hasPermissionFlag(user, PERMISSIONS.USER.UPDATE);
    const isSelf =
      targetUser.id === user.id &&
      hasPermissionFlag(user, PERMISSIONS.USER.UPDATE_SELF);

    return isAdmin || hasUpdate || isSelf;
  }

  /**
   * 사용자 삭제 권한 확인
   *
   * 삭제는 ADMIN만 가능
   */
  canDelete(user: AuthenticatedUser, targetUser: User): boolean {
    const isAdmin = user.roles.includes("ADMIN");
    const hasDelete = hasPermissionFlag(user, PERMISSIONS.USER.DELETE);

    // 자기 자신은 삭제할 수 없음
    if (targetUser.id === user.id) {
      return false;
    }

    return isAdmin || hasDelete;
  }

  /**
   * 사용자 생성 권한 검증 (예외 발생)
   */
  ensureCanCreate(user: AuthenticatedUser): void {
    if (!this.canCreate(user)) {
      throw new ForbiddenError("사용자 생성 권한이 없습니다.");
    }
  }

  /**
   * 사용자 조회 권한 검증 (예외 발생)
   */
  ensureCanRead(user: AuthenticatedUser, targetUser?: User): void {
    if (!this.canRead(user, targetUser)) {
      throw new ForbiddenError("사용자 조회 권한이 없습니다.");
    }
  }

  /**
   * 사용자 수정 권한 검증 (예외 발생)
   */
  ensureCanUpdate(user: AuthenticatedUser, targetUser: User): void {
    if (!this.canUpdate(user, targetUser)) {
      throw new ForbiddenError("사용자 수정 권한이 없습니다.");
    }
  }

  /**
   * 사용자 삭제 권한 검증 (예외 발생)
   */
  ensureCanDelete(user: AuthenticatedUser, targetUser: User): void {
    if (!this.canDelete(user, targetUser)) {
      if (targetUser.id === user.id) {
        throw new ForbiddenError("자기 자신을 삭제할 수 없습니다.");
      }
      throw new ForbiddenError("사용자 삭제 권한이 없습니다.");
    }
  }
}
