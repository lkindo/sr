import { User, Role, Permission } from "@prisma/client";
import { UserRepository } from "@/repositories/user.repository";
import { PermissionRepository } from "@/repositories/permission.repository"; // Import PermissionRepository

type UserWithPermissions = User & {
  roles: {
    role: Role & {
      permissions: {
        permission: Permission;
      }[];
    };
  }[];
};

export class PermissionService {
  private userRepository: UserRepository;
  private permissionRepository: PermissionRepository; // Instantiate PermissionRepository

  constructor() {
    this.userRepository = new UserRepository();
    this.permissionRepository = new PermissionRepository(); // Instantiate PermissionRepository
  }

  private async getFullUser(userId: string): Promise<UserWithPermissions | null> {
    // This single call fetches everything we need.
    return this.userRepository.findDetailsById(userId) as Promise<UserWithPermissions | null>;
  }

  async getAllPermissions(): Promise<Permission[]> {
    return this.permissionRepository.findAll();
  }

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

    for (const role of userRoles) {
      for (const rolePermission of role.permissions) {
        const { resource, action } = rolePermission.permission;
        if (resource === requiredResource && action === requiredAction) {
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
    const user = await this.getFullUser(userId);
    if (!user) return [];

    const permissionsSet = new Map<string, Permission>();
    user.roles.forEach(ur => {
      ur.role.permissions.forEach(rp => {
        permissionsSet.set(rp.permission.id, rp.permission);
      });
    });

    return Array.from(permissionsSet.values());
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    const user = await this.getFullUser(userId);
    if (!user) return [];

    return user.roles.map(ur => ur.role);
  }

  async requirePermission(userId: string, action: string): Promise<void> {
    const hasPermission = await this.checkPermission(userId, action);
    if (!hasPermission) {
      throw new Error(`권한이 없습니다: ${action}`);
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
            `${rolePermission.permission.resource}.${rolePermission.permission.action}`
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