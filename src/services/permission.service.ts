import { Permission, Role, User } from '@prisma/client';

import prisma from '@/lib/prisma';

type UserWithPermissions = User & {
  roles: {
    role: Role & {
      permissions: {
        permission: Permission;
      }[];
    };
  }[];
};

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
  constructor() {}

  /**
   * 사용자 전체 정보 조회 (역할, 권한 포함)
   *
   * @param userId - 사용자 ID
   * @returns 사용자 정보 (역할, 권한 포함) 또는 null
   * @private
   */
  private async getFullUser(userId: string): Promise<UserWithPermissions | null> {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    }) as Promise<UserWithPermissions | null>;
  }

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
    const user = await this.getFullUser(userId);
    if (!user || !user.isActive) {
      return false;
    }

    const userRoles = user.roles.map((ur) => ur.role);

    if (userRoles.some((role) => role.name === 'ADMIN')) {
      return true;
    }

    const [requiredResource, requiredAction] = requiredPermission.split(':');
    if (!requiredResource || !requiredAction) {
      return false; // Invalid permission format
    }

    // 대소문자 구분 없이 비교 (권한은 대문자로 저장되어 있음)
    const normalizedRequiredResource = requiredResource.toUpperCase();
    const normalizedRequiredAction = requiredAction.toUpperCase();

    for (const role of userRoles) {
      for (const rolePermission of role.permissions) {
        const { resource, action } = rolePermission.permission;
        // 대소문자 구분 없이 비교
        if (
          resource.toUpperCase() === normalizedRequiredResource &&
          action.toUpperCase() === normalizedRequiredAction
        ) {
          return true;
        }
      }
    }

    return false;
  }

  async checkRole(userId: string, roleName: string): Promise<boolean> {
    const user = await this.getFullUser(userId);
    if (!user) return false;

    return user.roles.some((ur) => ur.role.name === roleName);
  }

  async getUserPermissions(userId: string): Promise<Permission[]> {
    const user = await this.getFullUser(userId);
    if (!user) return [];

    const permissionsSet = new Map<string, Permission>();
    user.roles.forEach((ur) => {
      ur.role.permissions.forEach((rp) => {
        permissionsSet.set(rp.permission.id, rp.permission);
      });
    });

    return Array.from(permissionsSet.values());
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    const user = await this.getFullUser(userId);
    if (!user) return [];

    return user.roles.map((ur) => ur.role);
  }

  async requirePermission(userId: string, action: string): Promise<void> {
    const hasPermission = await this.checkPermission(userId, action);
    if (!hasPermission) {
      const { ForbiddenError } = await import('@/lib/errors');
      throw new ForbiddenError(`권한이 없습니다: ${action}`);
    }
  }

  async requireRole(userId: string, roleName: string): Promise<void> {
    const hasRole = await this.checkRole(userId, roleName);
    if (!hasRole) {
      throw new Error(`필요한 역할이 없습니다: ${roleName}`);
    }
  }

  async getUsersWithPermissions(requiredPermissions: string[]) {
    // 1. Fetch all roles and their permissions (small dataset)
    const roles = await prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    // Map Role ID to Permission Set
    const rolePermissionsMap = new Map<string, Set<string>>();

    roles.forEach((role) => {
      const perms = new Set<string>();
      role.permissions.forEach((rp) => {
        perms.add(`${rp.permission.resource}:${rp.permission.action}`);
      });
      rolePermissionsMap.set(role.id, perms);
    });

    // 2. Fetch users with just their role IDs (optimized query)
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        roles: {
          select: {
            roleId: true,
          },
        },
      },
    });

    const srHandlers = users.filter((user) => {
      const userRoleIds = user.roles.map((ur) => ur.roleId);

      // Aggregate permissions
      const userPermissions = new Set<string>();
      userRoleIds.forEach((roleId) => {
        const perms = rolePermissionsMap.get(roleId);
        if (perms) {
          perms.forEach((p) => userPermissions.add(p));
        }
      });

      return requiredPermissions.every((permission) => userPermissions.has(permission));
    });

    return srHandlers.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
    }));
  }
}
