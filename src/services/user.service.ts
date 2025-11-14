import { UserRepository } from "@/repositories/user.repository";
import { RoleRepository } from "@/repositories/role.repository";
import { ClientRepository } from "@/repositories/client.repository";
import { PermissionService } from "./permission.service";
import { hash, compare } from "bcryptjs";
import { userUpdateSchema } from "@/lib/schemas";
import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors";

type UserUpdateData = z.infer<typeof userUpdateSchema>;

export class UserService {
  private userRepository: UserRepository;
  private roleRepository: RoleRepository;
  private clientRepository: ClientRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.roleRepository = new RoleRepository();
    this.clientRepository = new ClientRepository();
  }

  async getUserById(id: string) {
    return this.userRepository.findById(id);
  }

  async getUserByEmail(email: string) {
    return this.userRepository.findByEmail(email);
  }

  async getUserByClientId(clientId: string) {
    return this.userRepository.findByClientId(clientId);
  }

  async getAllUsers(filters?: {
    search?: string;
    isActive?: string;
    userType?: string;
    roleId?: string;
    role?: string;
  }) {
    if (filters && Object.keys(filters).length > 0) {
      return this.userRepository.findAllWithFilters(filters);
    }
    return this.userRepository.findAll();
  }

  async updateUser(id: string, data: UserUpdateData) {
    const validated = userUpdateSchema.parse(data);
    return this.userRepository.update(id, validated);
  }

  async updatePassword(userId: string, hashedPassword: string) {
    return this.userRepository.updatePassword(userId, hashedPassword);
  }

  async updateProfile(userId: string, profileData: {
    name?: string;
    email?: string;
    image?: string;
  }) {
    return this.userRepository.updateProfile(userId, profileData);
  }

  async activateUser(userId: string) {
    return this.userRepository.activateUser(userId);
  }

  async deactivateUser(userId: string) {
    return this.userRepository.deactivateUser(userId);
  }

  async createUser(userData: {
    email: string;
    name: string;
    password: string;
    clientId?: string;
  }) {
    const hashedPassword = userData.password; // 실제로는 해시 처리가 필요합니다
    const user = await this.userRepository.create({
      email: userData.email,
      name: userData.name,
      password: hashedPassword,
      emailVerified: null,
      isActive: true,
    });

    // 클라이언트가 지정된 경우, 사용자-클라이언트 연결 생성
    if (userData.clientId) {
      await this.clientRepository.update(userData.clientId, {
        users: {
          create: {
            userId: user.id,
          },
        },
      });
    }

    return user;
  }

  async getUsersWithSRHandlingPermission() {
    const requiredPermissions = [
      "SR.CREATE",
      "SR.READ",
      "SR.UPDATE",
      "SR.DELETE",
      "SR.ASSIGN",
      "SR.STATUS_CHANGE",
      "COMMENT.CREATE",
      "COMMENT.READ",
      "COMMENT.UPDATE",
    ];
    const permissionService = new PermissionService();
    return permissionService.getUsersWithPermissions(requiredPermissions);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
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