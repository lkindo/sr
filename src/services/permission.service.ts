import { Permission, Prisma,Role, User } from '@prisma/client';

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

    // Identify ADMIN role (grants all permissions implicitly)
    const adminRole = roles.find((r) => r.name === 'ADMIN');
    const adminRoleId = adminRole?.id;

    // Map Role ID to Permission Set
    const rolePermissionsMap = new Map<string, Set<string>>();

    roles.forEach((role) => {
      const perms = new Set<string>();
      role.permissions.forEach((rp) => {
        perms.add(`${rp.permission.resource}:${rp.permission.action}`);
      });
      rolePermissionsMap.set(role.id, perms);
    });

    // 2. Build optimized query filter
    // Instead of fetching all users and filtering in memory, we construct a where clause
    // that requires the user to have at least one role for EACH required permission.
    const permissionFilters: Prisma.UserWhereInput[] = requiredPermissions.map((permission) => {
      // Find all role IDs that have this permission
      const allowedRoleIds: string[] = [];

      // Add roles that explicitly have the permission
      rolePermissionsMap.forEach((perms, roleId) => {
        if (perms.has(permission)) {
          allowedRoleIds.push(roleId);
        }
      });

      // Add ADMIN role if it exists (it implicitly has all permissions)
      if (adminRoleId && !allowedRoleIds.includes(adminRoleId)) {
        allowedRoleIds.push(adminRoleId);
      }

      // Construct filter: User must have at least one of these roles
      return {
        roles: {
          some: {
            roleId: {
              in: allowedRoleIds,
            },
          },
        },
      };
    });

    // 3. Fetch filtered users directly from DB
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        // Only add AND condition if there are permissions required
        ...(permissionFilters.length > 0 ? { AND: permissionFilters } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return users;
  }
}
