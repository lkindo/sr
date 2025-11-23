import { UserRepository } from "@/repositories/user.repository";
import { RoleRepository } from "@/repositories/role.repository";
import { ClientRepository } from "@/repositories/client.repository";
import { PermissionService } from "./permission.service";
import { invalidateCachePattern } from "@/lib/redis-cache";
import { hash, compare } from "bcryptjs";
import { userUpdateSchema } from "@/lib/schemas";
import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { User, Role, Permission } from "@prisma/client";

type UserUpdateData = z.infer<typeof userUpdateSchema>;

export class UserService {
  constructor(
    private userRepository: UserRepository = new UserRepository(),
    private roleRepository: RoleRepository = new RoleRepository(),
    private clientRepository: ClientRepository = new ClientRepository()
  ) { }

  async getUserById(id: string) {
    return this.userRepository.findDetailsById(id);
  }

  async getUserByEmail(email: string) {
    return this.userRepository.findByEmail(email);
  }

  async getUserByClientId(clientId: string): Promise<User[]> {
    return this.userRepository.findByClientId(clientId);
  }

  async getAllUsers(filters?: {
    search?: string;
    isActive?: string;
    userType?: string;
    roleId?: string;
    role?: string;
    clientId?: string;
  }, params?: {
    skip?: number;
    take?: number;
    orderBy?: any;
  }): Promise<{ data: User[]; total: number }> {
    if (filters && Object.keys(filters).length > 0) {
      const [data, total] = await this.userRepository.findAllWithFilters(filters, params);
      return { data, total };
    }
    const [data, total] = await this.userRepository.findAllPaginated(params);
    return { data, total };
  }

  async updateUser(id: string, data: UserUpdateData): Promise<User> {
    const validated = userUpdateSchema.parse(data);
    const { clientIds, ...updateData } = validated;

    const user = await this.userRepository.update(id, updateData);

    if (clientIds) {
      await this.userRepository.updateClientAssociations(id, clientIds);
    }

    return user;
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<User> {
    return this.userRepository.updatePassword(userId, hashedPassword);
  }

  async updateProfile(userId: string, profileData: {
    name?: string;
    email?: string;
    image?: string;
  }): Promise<User> {
    return this.userRepository.updateProfile(userId, profileData);
  }

  async activateUser(userId: string): Promise<User> {
    const user = await this.userRepository.activateUser(userId);
    // 캐시 무효화
    await invalidateCachePattern(`user:*:${userId}`);
    await invalidateCachePattern("user:list*");
    return user;
  }

  async deactivateUser(userId: string): Promise<User> {
    const user = await this.userRepository.deactivateUser(userId);
    // 캐시 무효화
    await invalidateCachePattern(`user:*:${userId}`);
    await invalidateCachePattern("user:list*");
    return user;
  }

  async createUser(userData: {
    email: string;
    name: string;
    password: string;
    clientId?: string;
    clientIds?: string[];
  }): Promise<User> {
    const hashedPassword = await hash(userData.password, 10);

    const user = await this.userRepository.create({
      email: userData.email,
      name: userData.name,
      password: hashedPassword,
      emailVerified: null,
      isActive: true,
    });

    // 클라이언트 연결 (clientIds 우선, 없으면 clientId 호환성 지원)
    const clientIds = userData.clientIds || (userData.clientId ? [userData.clientId] : []);

    if (clientIds.length > 0) {
      await this.userRepository.updateClientAssociations(user.id, clientIds);
    }

    return user;
  }

  async getUsersWithSRHandlingPermission(
    permissionService: PermissionService = new PermissionService()
  ): Promise<Array<{ id: string; name: string; email: string }>> {
    const requiredPermissions = [
      "SR:CREATE",
      "SR:READ",
      "SR:UPDATE",
      "SR:DELETE",
      "SR:ASSIGN",
      "SR:STATUS_CHANGE",
      "COMMENT:CREATE",
      "COMMENT:READ",
      "COMMENT:UPDATE",
    ];
    return permissionService.getUsersWithPermissions(requiredPermissions);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<User> {
    // 사용자 조회
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("사용자", userId);
    }

    // 현재 비밀번호 확인
    if (user.password) {
      const isPasswordValid = await compare(currentPassword, user.password);
      if (!isPasswordValid) {
        throw new ValidationError("현재 비밀번호가 일치하지 않습니다.");
      }
    }

    // 새 비밀번호 해시
    const hashedPassword = await hash(newPassword, 10);

    // 비밀번호 업데이트
    return this.userRepository.updatePassword(userId, hashedPassword);
  }
}