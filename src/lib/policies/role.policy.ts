/**
 * Role (역할) Policy
 *
 * 역할 리소스에 대한 권한 정책을 정의합니다.
 */

import { Role } from "@prisma/client";
import { AuthenticatedUser } from "@/types/session";
import { ForbiddenError } from "@/lib/errors";
import { PERMISSIONS, hasPermissionFlag } from "@/lib/permission-helpers";

export class RolePolicy {
  /**
   * 역할 생성 권한 확인
   *
   * 역할 생성은 ADMIN만 가능
   */
  canCreate(user: AuthenticatedUser): boolean {
    return (
      user.roles.includes("ADMIN") ||
      hasPermissionFlag(user, PERMISSIONS.ROLE.CREATE)
    );
  }

  /**
   * 역할 조회 권한 확인
   *
   * 조회 가능한 경우:
   * - ADMIN 역할
   * - ROLE:READ 권한 보유
   */
  canRead(user: AuthenticatedUser, _role?: Role): boolean {
    return (
      user.roles.includes("ADMIN") ||
      hasPermissionFlag(user, PERMISSIONS.ROLE.READ)
    );
  }

  /**
   * 역할 수정 권한 확인
   *
   * 수정 가능한 경우:
   * - ADMIN 역할
   * - ROLE:UPDATE 권한 보유
   */
  canUpdate(user: AuthenticatedUser, role: Role): boolean {
    const isAdmin = user.roles.includes("ADMIN");
    const hasUpdate = hasPermissionFlag(user, PERMISSIONS.ROLE.UPDATE);

    // ADMIN 역할은 수정할 수 없음 (시스템 보호)
    if (role.name === "ADMIN") {
      return false;
    }

    return isAdmin || hasUpdate;
  }

  /**
   * 역할 삭제 권한 확인
   *
   * 삭제 가능한 경우:
   * - ADMIN 역할
   * - ROLE:DELETE 권한 보유
   */
  canDelete(user: AuthenticatedUser, role: Role): boolean {
    const isAdmin = user.roles.includes("ADMIN");
    const hasDelete = hasPermissionFlag(user, PERMISSIONS.ROLE.DELETE);

    // 시스템 역할(ADMIN, USER, GUEST)은 삭제할 수 없음
    const systemRoles = ["ADMIN", "USER", "GUEST"];
    if (systemRoles.includes(role.name)) {
      return false;
    }

    return isAdmin || hasDelete;
  }

  /**
   * 역할 할당 권한 확인
   *
   * 역할을 사용자에게 할당/해제할 수 있는지 확인
   */
  canAssign(user: AuthenticatedUser, role: Role): boolean {
    const isAdmin = user.roles.includes("ADMIN");
    const hasAssign = hasPermissionFlag(user, PERMISSIONS.ROLE.ASSIGN);

    // ADMIN 역할 할당은 ADMIN만 가능
    if (role.name === "ADMIN") {
      return isAdmin;
    }

    return isAdmin || hasAssign;
  }

  /**
   * 역할 생성 권한 검증 (예외 발생)
   */
  ensureCanCreate(user: AuthenticatedUser): void {
    if (!this.canCreate(user)) {
      throw new ForbiddenError("역할 생성 권한이 없습니다.");
    }
  }

  /**
   * 역할 조회 권한 검증 (예외 발생)
   */
  ensureCanRead(user: AuthenticatedUser, role?: Role): void {
    if (!this.canRead(user, role)) {
      throw new ForbiddenError("역할 조회 권한이 없습니다.");
    }
  }

  /**
   * 역할 수정 권한 검증 (예외 발생)
   */
  ensureCanUpdate(user: AuthenticatedUser, role: Role): void {
    if (!this.canUpdate(user, role)) {
      if (role.name === "ADMIN") {
        throw new ForbiddenError("ADMIN 역할은 수정할 수 없습니다.");
      }
      throw new ForbiddenError("역할 수정 권한이 없습니다.");
    }
  }

  /**
   * 역할 삭제 권한 검증 (예외 발생)
   */
  ensureCanDelete(user: AuthenticatedUser, role: Role): void {
    if (!this.canDelete(user, role)) {
      const systemRoles = ["ADMIN", "USER", "GUEST"];
      if (systemRoles.includes(role.name)) {
        throw new ForbiddenError("시스템 역할은 삭제할 수 없습니다.");
      }
      throw new ForbiddenError("역할 삭제 권한이 없습니다.");
    }
  }

  /**
   * 역할 할당 권한 검증 (예외 발생)
   */
  ensureCanAssign(user: AuthenticatedUser, role: Role): void {
    if (!this.canAssign(user, role)) {
      if (role.name === "ADMIN") {
        throw new ForbiddenError("ADMIN 역할 할당은 ADMIN만 가능합니다.");
      }
      throw new ForbiddenError("역할 할당 권한이 없습니다.");
    }
  }
}
