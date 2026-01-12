import { UserRepository } from "@/repositories/user.repository";
import { RoleRepository } from "@/repositories/role.repository";
import { ClientRepository } from "@/repositories/client.repository";
import { PermissionService } from "./permission.service";
import { invalidateCachePattern } from "@/lib/redis-cache";
import { hash, compare } from "bcryptjs";
import { userUpdateSchema } from "@/lib/schemas";
import { z } from "zod";
import { NotFoundError, ValidationError, BusinessRuleError } from "@/lib/errors";
import type { User, Prisma } from "@prisma/client";

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
    orderBy?: Prisma.UserOrderByWithRelationInput;
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
    // 1. 진행 중인 SR 확인
    const prisma = (await import("@/lib/prisma")).default;
    const activeSRs = await prisma.sR.findMany({
      where: {
        assigneeId: userId,
        status: { in: ['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD'] }
      },
      select: {
        id: true,
        srNumber: true,
        title: true,
        status: true
      }
    });

    // 2. 진행 중인 SR이 있으면 에러 반환
    if (activeSRs.length > 0) {
      const srList = activeSRs.map(sr => `${sr.srNumber} (${sr.status})`).join(', ');
      throw new ValidationError(
        `사용자에게 ${activeSRs.length}개의 진행 중인 SR이 할당되어 있습니다. ` +
        `비활성화하기 전에 다음 SR을 다른 담당자에게 재할당하세요: ${srList}`
      );
    }

    // 3. 진행 중인 SR이 없으면 비활성화
    const user = await this.userRepository.deactivateUser(userId);

    // 캐시 무효화
    await invalidateCachePattern(`user:*:${userId}`);
    await invalidateCachePattern("user:list*");
    return user;
  }

  async hardDeleteUser(userId: string): Promise<User> {
    const prisma = (await import("@/lib/prisma")).default;

    // 1. 연관 데이터 확인 (SR 관련)
    const relatedDataCount = await prisma.sR.count({
      where: {
        OR: [
          { requesterId: userId },
          { assigneeId: userId },
          { intakeById: userId },
        ],
      },
    });

    if (relatedDataCount > 0) {
      throw new BusinessRuleError(
        "해당 사용자는 SR 요청 또는 처리 이력이 있어 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요."
      );
    }

    // 2. 활동 이력 확인
    const activityCount = await prisma.sRActivity.count({
      where: { userId },
    });

    if (activityCount > 0) {
      throw new BusinessRuleError(
        "해당 사용자는 SR 활동 이력이 있어 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요."
      );
    }

    // 3. 댓글 이력 확인
    const commentCount = await prisma.sRComment.count({
      where: { userId },
    });

    if (commentCount > 0) {
      throw new BusinessRuleError(
        "해당 사용자는 SR 댓글 이력이 있어 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요."
      );
    }

    // 4. 상태 변경 이력 확인
    const statusHistoryCount = await prisma.sRStatusHistory.count({
      where: { changedBy: userId },
    });

    if (statusHistoryCount > 0) {
      throw new BusinessRuleError(
        "해당 사용자는 SR 상태 변경 이력이 있어 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요."
      );
    }

    // 5. 완전 삭제 수행
    const deletedUser = await this.userRepository.delete(userId);

    // 캐시 무효화
    await invalidateCachePattern(`user:*:${userId}`);
    await invalidateCachePattern("user:list*");

    return deletedUser;
  }

  async createUser(userData: {
    email: string;
    name: string;
    password: string;
    userType?: "ENGINEER" | "CLIENT";
    clientId?: string;
    clientIds?: string[];
    roleIds?: string[];
  }): Promise<User> {
    const hashedPassword = await hash(userData.password, 10);

    // 클라이언트 연결 (clientIds 우선, 없으면 clientId 호환성 지원)
    const clientIds = userData.clientIds || (userData.clientId ? [userData.clientId] : []);

    // 트랜잭션으로 원자적 처리
    const prisma = (await import("@/lib/prisma")).default;

    return await prisma.$transaction(async (tx) => {
      // 1. 사용자 생성
      const user = await tx.user.create({
        data: {
          email: userData.email,
          name: userData.name,
          password: hashedPassword,
          emailVerified: null,
          isActive: true,
        },
      });

      // 2. 역할 할당 (roleIds가 제공되거나 userType으로 자동 결정)
      let roleIdsToAssign = userData.roleIds || [];

      if (roleIdsToAssign.length === 0 && userData.userType) {
        // userType 기반 기본 역할 자동 할당
        const defaultRoleName = userData.userType === "CLIENT" ? "CLIENT_USER" : "ENGINEER";
        const defaultRole = await tx.role.findFirst({
          where: { name: defaultRoleName },
        });

        if (defaultRole) {
          roleIdsToAssign = [defaultRole.id];
        }
      }

      if (roleIdsToAssign.length > 0) {
        await tx.userRole.createMany({
          data: roleIdsToAssign.map((roleId) => ({
            userId: user.id,
            roleId,
          })),
        });
      }

      // 3. 고객사 할당
      if (clientIds.length > 0) {
        await tx.userClient.createMany({
          data: clientIds.map((clientId) => ({
            userId: user.id,
            clientId,
          })),
        });
      }

      // 4. 전체 정보와 함께 반환
      return await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          clients: {
            include: {
              client: true,
            },
          },
        },
      });
    });
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
// Force rebuild