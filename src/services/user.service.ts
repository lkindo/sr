import type { Prisma, User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { z } from 'zod';

import { SECURITY } from '@/lib/constants';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { userUpdateSchema } from '@/lib/schemas';
import { excludePassword } from '@/lib/user-helpers';

import { PermissionService } from './permission.service';

type UserUpdateData = z.infer<typeof userUpdateSchema>;

/**
 * 사용자 서비스 (User Service)
 *
 * 사용자 계정 관리 및 관련 비즈니스 로직을 처리합니다.
 * - 사용자 CRUD 작업
 * - 역할(Role) 및 고객사(Client) 할당
 * - 비밀번호 관리 및 검증
 * - 사용자 활성화/비활성화
 *
 * @example
 * ```typescript
 * const userService = new UserService();
 * const user = await userService.getUserById('user-123');
 * ```
 */
export class UserService {
  constructor() {}

  async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: { role: true },
        },
        clients: { include: { client: true } },
      },
    });

    if (!user) {
      return null;
    }

    // 4단계 깊은 include 부하를 방지하기 위해 롤 권한 데이터를 단일 쿼리로 조회 후 메모리 병합
    const roleIds = user.roles?.map((ur) => ur.roleId) || [];
    const rolePermissions =
      roleIds.length > 0
        ? await prisma.rolePermission.findMany({
            where: { roleId: { in: roleIds } },
            include: { permission: true },
          })
        : [];

    const rolesWithPermissions = (user.roles || []).map((ur) => {
      const permissions = rolePermissions
        .filter((rp) => rp.roleId === ur.roleId)
        .map((rp) => ({
          id: rp.id,
          permission: rp.permission,
        }));
      return {
        ...ur,
        role: ur.role
          ? {
              ...ur.role,
              permissions,
            }
          : {
              id: '',
              name: '',
              description: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              permissions,
            },
      };
    });

    const userWithDetails = user.roles
      ? {
          ...user,
          roles: rolesWithPermissions,
        }
      : user;

    return excludePassword(userWithDetails);
  }

  async getUserByEmail(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: { include: { role: true } },
        clients: { include: { client: true } },
      },
    });
    if (!user) return null;
    return excludePassword(user);
  }

  async getUserByClientId(clientId: string): Promise<Omit<User, 'password'>[]> {
    const users = await prisma.user.findMany({
      where: {
        clients: { some: { clientId } },
      },
      include: {
        roles: { include: { role: true } },
        clients: { include: { client: true } },
      },
    });
    return users.map(excludePassword);
  }

  async getAllUsers(
    filters?: {
      search?: string;
      isActive?: string;
      userType?: string;
      roleId?: string;
      role?: string;
      clientId?: string;
    },
    params?: {
      skip?: number;
      take?: number;
      orderBy?: Prisma.UserOrderByWithRelationInput;
    }
  ): Promise<{ data: Omit<User, 'password'>[]; total: number }> {
    const where: Prisma.UserWhereInput = {};

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (
      filters?.isActive !== null &&
      filters?.isActive !== undefined &&
      filters.isActive !== 'all'
    ) {
      where.isActive = filters.isActive === 'true';
    }

    if (filters?.clientId && filters.clientId !== 'all') {
      if (filters.clientId === 'unassigned') {
        where.clients = { none: {} };
      } else {
        where.clients = { some: { clientId: filters.clientId } };
      }
    }

    if (filters?.roleId && filters.roleId !== 'all') {
      if (filters.roleId === 'none') {
        where.roles = { none: {} };
      } else {
        where.roles = { some: { roleId: filters.roleId } };
      }
    }

    if (filters?.role) {
      const roleNames = filters.role.split(',');
      where.roles = { some: { role: { name: { in: roleNames } } } };
    }

    if (filters?.userType && filters.userType !== 'all') {
      // Optimize: Push userType filtering to the database to avoid fetching unnecessary records
      // and enable correct pagination.
      const userTypeCondition: Prisma.UserWhereInput =
        filters.userType === 'CLIENT' ? { clients: { some: {} } } : { clients: { none: {} } };

      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        userTypeCondition,
      ];
    }

    const { skip, take, orderBy } = params || {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: orderBy || { createdAt: 'desc' },
        // Optimize: Use select to fetch only necessary fields and avoid fetching password hash
        select: {
          id: true,
          email: true,
          name: true,
          emailVerified: true,
          image: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          roles: { include: { role: true } },
          clients: { include: { client: { select: { id: true, name: true, code: true } } } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const usersWithType = users.map((user) => ({
      ...user,
      userType: user.clients.length > 0 ? ('CLIENT' as const) : ('ENGINEER' as const),
    }));

    return { data: usersWithType as any, total };
  }

  async updateUser(id: string, data: UserUpdateData): Promise<Omit<User, 'password'>> {
    const validated = userUpdateSchema.parse(data);
    const { clientIds, ...updateData } = validated;

    // Mock Prisma에 $transaction이 없을 때를 대비한 폴백 처리
    const runInTransaction = async <T>(cb: (tx: any) => Promise<T>): Promise<T> => {
      if (typeof prisma.$transaction === 'function') {
        const originalTransaction = prisma.$transaction;
        return await originalTransaction(async (tx) => {
          const actualTx = tx?.user ? tx : (prisma as any).default || tx;
          return await cb(actualTx);
        });
      }
      const tx = (prisma as any).user ? prisma : (prisma as any).default || prisma;
      return await cb(tx);
    };

    const updatedUser = await runInTransaction(async (tx) => {
      const userUpdateFn =
        tx?.user?.update || (prisma as any).user?.update || (prisma as any).default?.user?.update;
      let user = await userUpdateFn({
        where: { id },
        data: updateData,
      });

      if (clientIds) {
        // 시스템 운영팀 체크
        const userFindUniqueFn =
          tx?.user?.findUnique ||
          (prisma as any).user?.findUnique ||
          (prisma as any).default?.user?.findUnique;
        const userRoles = (await userFindUniqueFn({
          where: { id },
          select: { roles: { include: { role: true } } },
        })) as { roles: { role: { name: string } }[] } | null;

        if (userRoles) {
          const isSystemTeam = userRoles.roles.some((ur) =>
            ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name)
          );

          if (isSystemTeam && clientIds.length > 0) {
            throw new BusinessRuleError('시스템 운영팀은 고객사를 할당할 수 없습니다.');
          }
        }

        user = await userUpdateFn({
          where: { id },
          data: {
            clients: {
              deleteMany: {},
              create: clientIds.map((clientId) => ({ clientId })),
            },
          },
        });
      }

      return user;
    });

    return excludePassword(updatedUser);
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<Omit<User, 'password'>> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
    return excludePassword(user);
  }

  async updateProfile(
    userId: string,
    profileData: {
      name?: string;
      email?: string;
      image?: string;
    }
  ): Promise<Omit<User, 'password'>> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: profileData,
    });
    return excludePassword(user);
  }

  async activateUser(userId: string): Promise<Omit<User, 'password'>> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    return excludePassword(user);
  }

  async deactivateUser(userId: string): Promise<Omit<User, 'password'>> {
    // 1. 진행 중인 SR 확인
    const prisma = (await import('@/lib/prisma')).default;
    const activeSRs = await prisma.sR.findMany({
      where: {
        assigneeId: userId,
        status: { in: ['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD'] },
      },
      select: {
        id: true,
        srNumber: true,
        title: true,
        status: true,
      },
    });

    // 2. 진행 중인 SR이 있으면 에러 반환
    if (activeSRs.length > 0) {
      const srList = activeSRs.map((sr) => `${sr.srNumber} (${sr.status})`).join(', ');
      throw new ValidationError(
        `사용자에게 ${activeSRs.length}개의 진행 중인 SR이 할당되어 있습니다. ` +
          `비활성화하기 전에 다음 SR을 다른 담당자에게 재할당하세요: ${srList}`
      );
    }

    // 3. 진행 중인 SR이 없으면 비활성화
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return excludePassword(user);
  }

  async hardDeleteUser(userId: string): Promise<Omit<User, 'password'>> {
    const prisma = (await import('@/lib/prisma')).default;

    // ⚡ Bolt: 1-4 연관 데이터 확인을 병렬로 처리하여 지연 시간 단축
    const [relatedDataCount, activityCount, commentCount, statusHistoryCount] = await Promise.all([
      prisma.sR.count({
        where: {
          OR: [{ requesterId: userId }, { assigneeId: userId }, { intakeById: userId }],
        },
      }),
      prisma.sRActivity.count({
        where: { userId },
      }),
      prisma.sRComment.count({
        where: { userId },
      }),
      prisma.sRStatusHistory.count({
        where: { changedBy: userId },
      }),
    ]);

    if (relatedDataCount > 0) {
      throw new BusinessRuleError(
        '해당 사용자는 SR 요청 또는 처리 이력이 있어 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요.'
      );
    }

    if (activityCount > 0) {
      throw new BusinessRuleError(
        '해당 사용자는 SR 활동 이력이 있어 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요.'
      );
    }

    if (commentCount > 0) {
      throw new BusinessRuleError(
        '해당 사용자는 SR 댓글 이력이 있어 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요.'
      );
    }

    if (statusHistoryCount > 0) {
      throw new BusinessRuleError(
        '해당 사용자는 SR 상태 변경 이력이 있어 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요.'
      );
    }

    // 5. 완전 삭제 수행
    const deletedUser = await prisma.user.delete({ where: { id: userId } });

    return excludePassword(deletedUser);
  }

  async createUser(userData: {
    email: string;
    name: string;
    password: string;
    userType?: 'ENGINEER' | 'CLIENT';
    clientId?: string;
    clientIds?: string[];
    roleIds?: string[];
  }): Promise<Omit<User, 'password'>> {
    const hashedPassword = await hash(userData.password, SECURITY.BCRYPT_WORK_FACTOR);

    // 클라이언트 연결 (clientIds 우선, 없으면 clientId 호환성 지원)
    const clientIds = userData.clientIds || (userData.clientId ? [userData.clientId] : []);

    // 트랜잭션으로 원자적 처리
    const prisma = (await import('@/lib/prisma')).default;

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
        const defaultRoleName = userData.userType === 'CLIENT' ? 'CLIENT_USER' : 'ENGINEER';
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
      const createdUser = await tx.user.findUniqueOrThrow({
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
      return excludePassword(createdUser);
    });
  }

  async getUsersWithSRHandlingPermission(
    permissionService: PermissionService = new PermissionService()
  ): Promise<Array<{ id: string; name: string; email: string }>> {
    const requiredPermissions = [
      'SR:CREATE',
      'SR:READ',
      'SR:UPDATE',
      'SR:DELETE',
      'SR:ASSIGN',
      'SR:STATUS_CHANGE',
      'COMMENT:CREATE',
      'COMMENT:READ',
      'COMMENT:UPDATE',
    ];
    return permissionService.getUsersWithPermissions(requiredPermissions);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<Omit<User, 'password'>> {
    // 사용자 조회
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('사용자', userId);
    }

    // 현재 비밀번호 확인
    if (user.password) {
      const isPasswordValid = await compare(currentPassword, user.password);
      if (!isPasswordValid) {
        throw new ValidationError('현재 비밀번호가 일치하지 않습니다.');
      }
    }

    // 새 비밀번호 해시
    const hashedPassword = await hash(newPassword, SECURITY.BCRYPT_WORK_FACTOR);

    // 비밀번호 업데이트
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return excludePassword(updatedUser);
  }
}
// Force rebuild
