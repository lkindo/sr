import { User, Role, Permission } from "@prisma/client";
import { UserRepository } from "@/repositories/user.repository";
import { RoleRepository } from "@/repositories/role.repository";
import { PermissionRepository } from "@/repositories/permission.repository";

export class PermissionService {
  private userRepository: UserRepository;
  private roleRepository: RoleRepository;
  private permissionRepository: PermissionRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.roleRepository = new RoleRepository();
    this.permissionRepository = new PermissionRepository();
  }

  async checkPermission(userId: string, action: string): Promise<boolean> {
    // 사용자 정보 조회
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive) {
      return false;
    }

    // 사용자의 모든 역할 가져오기
    const userRoles = await this.roleRepository.findByUserId(userId);
    
    // 역할 중 ADMIN이 있으면 모든 권한 허용
    if (userRoles.some(role => role.name === 'ADMIN')) {
      return true;
    }

    // 필요한 권한이 있는지 확인
    for (const role of userRoles) {
      const permissions = await this.permissionRepository.findByRoleId(role.id);
      if (permissions.some(permission => 
        permission.resource === action.split(':')[0] && 
        permission.action === action.split(':')[1]
      )) {
        return true;
      }
    }

    return false;
  }

  async checkRole(userId: string, roleName: string): Promise<boolean> {
    const userRoles = await this.roleRepository.findByUserId(userId);
    return userRoles.some(role => role.name === roleName);
  }

  async getUserPermissions(userId: string): Promise<Permission[]> {
    const userRoles = await this.roleRepository.findByUserId(userId);
    const allPermissions: Permission[] = [];

    for (const role of userRoles) {
      const permissions = await this.permissionRepository.findByRoleId(role.id);
      allPermissions.push(...permissions);
    }

    return allPermissions;
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    return this.roleRepository.findByUserId(userId);
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
}