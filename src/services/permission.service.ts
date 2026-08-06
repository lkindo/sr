import { Permission } from '@prisma/client';

import prisma from '@/lib/prisma';

/**
 * 권한 서비스
 *
 * 사용자 권한 관리 및 검증 로직을 처리합니다.
 * - 권한 조회 및 캐싱
 * - 사용자 권한 검증 (RBAC)
 * - ADMIN 역할 특별 권한 처리
 *
 * 권한 형식: "리소스:액션" (예: "SR:CREATE", "CLIENT:UPDATE")
 */
export class PermissionService {
  /**
   * 전체 권한 목록 조회
   *
   * @returns 권한 목록
   */
  async getAllPermissions(): Promise<Permission[]> {
    return prisma.permission.findMany();
  }

  /**
   * 사용자 권한 검증
   *
   * 프로세스:
   * 1. 사용자 정보 조회 (캐시 사용)
   * 2. 활성 사용자 확인
   * 3. ADMIN 역할 확인 (모든 권한 보유)
   * 4. 요청 권한 형식 검증 (리소스:액션)
   * 5. 사용자 역할의 권한 목록에서 일치 여부 확인
   *
   * @param userId - 사용자 ID
   * @param requiredPermission - 필요한 권한 (형식: "리소스:액션", 예: "SR:CREATE")
   *
   * @returns 권한 보유 여부 (true/false)
   *
   * @example
   * ```typescript
   * const canCreateSR = await permissionService.checkPermission(
   *   userId,
   *   'SR:CREATE'
   * );
   *
   * if (!canCreateSR) {
   *   throw new ForbiddenError('SR 생성 권한이 없습니다.');
   * }
   * ```
   */
  async checkPermission(userId: string, requiredPermission: string): Promise<boolean> {
    const [requiredResource, requiredAction] = requiredPermission.split(':');
    if (!requiredResource || !requiredAction) {
      return false; // Invalid permission format
    }

    const normalizedRequiredResource = requiredResource.toUpperCase();
    const normalizedRequiredAction = requiredAction.toUpperCase();

    // Optimize: Count UserRoles directly in DB instead of fetching full user object
    const count = await prisma.userRole.count({
      where: {
        userId,
        // Ensure user is active
        user: { isActive: true },
        role: {
          OR: [
            // ADMIN role has all permissions
            { name: 'ADMIN' },
            // Check for specific permission
            {
              permissions: {
                some: {
                  permission: {
                    resource: normalizedRequiredResource,
                    action: normalizedRequiredAction,
                  },
                },
              },
            },
          ],
        },
      },
    });

    return count > 0;
  }

  async requirePermission(userId: string, action: string): Promise<void> {
    const hasPermission = await this.checkPermission(userId, action);
    if (!hasPermission) {
      const { ForbiddenError } = await import('@/lib/errors');
      throw new ForbiddenError(`권한이 없습니다: ${action}`);
    }
  }
}
