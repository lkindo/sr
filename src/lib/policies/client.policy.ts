/**
 * Client (고객사) Policy
 *
 * 고객사 리소스에 대한 권한 정책을 정의합니다.
 */

import { Client } from "@prisma/client";
import { AuthenticatedUser } from "@/types/session";
import { ForbiddenError } from "@/lib/errors";
import { PERMISSIONS, hasPermissionFlag } from "@/lib/permission-helpers";

export class ClientPolicy {
  /**
   * 고객사 생성 권한 확인
   */
  canCreate(user: AuthenticatedUser): boolean {
    return (
      user.roles.includes("ADMIN") ||
      hasPermissionFlag(user, PERMISSIONS.CLIENT.CREATE)
    );
  }

  /**
   * 고객사 조회 권한 확인
   *
   * 조회 가능한 경우:
   * - ADMIN 역할
   * - CLIENT:READ 권한 보유
   * - 본인이 속한 고객사 (UserClient 관계)
   */
  canRead(user: AuthenticatedUser, client?: Client): boolean {
    const isAdmin = user.roles.includes("ADMIN");
    const canViewAll = hasPermissionFlag(user, PERMISSIONS.CLIENT.READ);

    // 특정 고객사 조회 시
    if (client) {
      const isMemberOfClient = user.clientIds?.includes(client.id) ?? false;
      return isAdmin || canViewAll || isMemberOfClient;
    }

    // 전체 고객사 목록 조회 시
    return isAdmin || canViewAll;
  }

  /**
   * 고객사 수정 권한 확인
   */
  canUpdate(user: AuthenticatedUser, client: Client): boolean {
    return (
      user.roles.includes("ADMIN") ||
      hasPermissionFlag(user, PERMISSIONS.CLIENT.UPDATE)
    );
  }

  /**
   * 고객사 삭제 권한 확인
   */
  canDelete(user: AuthenticatedUser): boolean {
    return (
      user.roles.includes("ADMIN") ||
      hasPermissionFlag(user, PERMISSIONS.CLIENT.DELETE)
    );
  }

  /**
   * 고객사 생성 권한 검증 (예외 발생)
   */
  ensureCanCreate(user: AuthenticatedUser): void {
    if (!this.canCreate(user)) {
      throw new ForbiddenError("고객사 생성 권한이 없습니다.");
    }
  }

  /**
   * 고객사 조회 권한 검증 (예외 발생)
   */
  ensureCanRead(user: AuthenticatedUser, client?: Client): void {
    if (!this.canRead(user, client)) {
      throw new ForbiddenError("고객사 조회 권한이 없습니다.");
    }
  }

  /**
   * 고객사 수정 권한 검증 (예외 발생)
   */
  ensureCanUpdate(user: AuthenticatedUser, client: Client): void {
    if (!this.canUpdate(user, client)) {
      throw new ForbiddenError("고객사 수정 권한이 없습니다.");
    }
  }

  /**
   * 고객사 삭제 권한 검증 (예외 발생)
   */
  ensureCanDelete(user: AuthenticatedUser): void {
    if (!this.canDelete(user)) {
      throw new ForbiddenError("고객사 삭제 권한이 없습니다.");
    }
  }
}
