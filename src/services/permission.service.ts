import { User, Role, Permission } from "@prisma/client";
import { UserRepository } from "@/repositories/user.repository";
import { PermissionRepository } from "@/repositories/permission.repository";
import { getCachedData, CacheKeys, invalidateCache } from "@/lib/redis-cache";

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
  constructor(
    private userRepository: UserRepository = new UserRepository(),
    private permissionRepository: PermissionRepository = new PermissionRepository()
  ) {}

  /**
   * 사용자 전체 정보 조회 (역할, 권한 포함)
   *
   * Redis 캐시를 사용하여 성능을 최적화합니다. (TTL: 10분)
   *
   * @param userId - 사용자 ID
   * @returns 사용자 정보 (역할, 권한 포함) 또는 null
   * @private
   */
  private async getFullUser(userId: string): Promise<UserWithPermissions | null> {
    // 캐시된 사용자 정보 조회 또는 생성
    return getCachedData(
      `user:full:${userId}`,
      async () => {
        return this.userRepository.findDetailsById(userId) as Promise<UserWithPermissions | null>;
      },
      600 // 10분 캐시 (권한 정보는 자주 변경되지 않음)
    );
  }

  /**
   * 전체 권한 목록 조회
   *
   * Redis 캐시를 사용합니다. (TTL: 30분)
   *
   * @returns 권한 목록
   */
  async getAllPermissions(): Promise<Permission[]> {
    return getCachedData(
      CacheKeys.userPermissions("all"),
      async () => {
        return this.permissionRepository.findAll();
      },
      1800 // 30분 캐시 (권한 목록은 거의 변경되지 않음)
    );
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

    const userRoles = user.roles.map(ur => ur.role);

    if (userRoles.some(role => role.name === 'ADMIN')) {
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

    return user.roles.some(ur => ur.role.name === roleName);
  }

  async getUserPermissions(userId: string): Promise<Permission[]> {
    return getCachedData(
      CacheKeys.userPermissions(userId),
      async () => {
        const user = await this.getFullUser(userId);
        if (!user) return [];

        const permissionsSet = new Map<string, Permission>();
        user.roles.forEach(ur => {
          ur.role.permissions.forEach(rp => {
            permissionsSet.set(rp.permission.id, rp.permission);
          });
        });

        return Array.from(permissionsSet.values());
      },
      600 // 10분 캐시
    );
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    return getCachedData(
      CacheKeys.userRoles(userId),
      async () => {
        const user = await this.getFullUser(userId);
        if (!user) return [];

        return user.roles.map(ur => ur.role);
      },
      600 // 10분 캐시
    );
  }

  async requirePermission(userId: string, action: string): Promise<void> {
    const hasPermission = await this.checkPermission(userId, action);
    if (!hasPermission) {
      const { ForbiddenError } = await import("@/lib/errors");
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
    const users = await this.userRepository.findAllDetails();

    const srHandlers = users.filter((user) => {
      const userPermissions = new Set<string>();
      user.roles.forEach((userRole) => {
        userRole.role.permissions.forEach((rolePermission) => {
          userPermissions.add(
            `${rolePermission.permission.resource}:${rolePermission.permission.action}`
          );
        });
      });

      return requiredPermissions.every((permission) =>
        userPermissions.has(permission)
      );
    });

    return srHandlers.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
    }));
  }
}