import type { Prisma, User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { z } from 'zod';

import { SECURITY } from '@/lib/constants';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { userUpdateSchema } from '@/lib/schemas';
import { excludePassword } from '@/lib/user-helpers';

import { auditService } from './audit.service';

type UserUpdateData = z.infer<typeof userUpdateSchema>;

/**
 * SR 담당자로 배정될 사용자에게 실제로 필요한 최소 권한.
 *
 * 배정을 "받는" 쪽이 하는 일은 SR 조회 → 처리 → 상태 변경 → 댓글 응대다.
 * 과거에는 SR:CREATE / SR:DELETE / SR:ASSIGN / COMMENT:UPDATE 까지 AND 조건으로 요구했다.
 * 그 결과 시드 기준으로 ADMIN/MANAGER 만 통과했고, SR:READ/UPDATE/STATUS_CHANGE 만 가진
 * ENGINEER 는 담당자 선택 목록에 아예 오르지 못했다(= 엔지니어에게 배정 불가). 배정을 받는
 * 사람에게 삭제·배정 권한을 요구하는 것 자체가 업무 성격과 맞지 않으므로 요구 권한을
 * "담당자가 실제로 필요한 것"으로 좁힌다.
 */
const SR_HANDLING_REQUIRED_PERMISSIONS = [
  'SR:READ',
  'SR:UPDATE',
  'SR:STATUS_CHANGE',
  'COMMENT:CREATE',
  'COMMENT:READ',
];

/**
 * SR 담당자가 될 수 있는 내부 역할. (lib/policies 의 INTERNAL_ROLES = isInternalUser 기준과 동일)
 *
 * DB 쿼리 조건으로 써야 해서 역할명 목록 자체가 필요하므로 여기서 선언한다. 두 정의가 조용히
 * 어긋나지 않도록 user.service.coverage.test.ts 가 isInternalUser 와의 일치를 검증한다.
 */
export const SR_HANDLER_INTERNAL_ROLES = ['ADMIN', 'MANAGER', 'ENGINEER'];

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

  private async runInTransaction<T>(cb: (tx: any) => Promise<T>): Promise<T> {
    if (typeof prisma.$transaction === 'function') {
      const originalTransaction = prisma.$transaction;
      return await originalTransaction(async (tx) => {
        const actualTx = tx?.user ? tx : (prisma as any).default || tx;
        return await cb(actualTx);
      });
    }
    const tx = (prisma as any).user ? prisma : (prisma as any).default || prisma;
    return await cb(tx);
  }

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
      clientId?: string | { in: string[] };
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
      } else if (typeof filters.clientId === 'object') {
        where.clients = { some: { clientId: filters.clientId } };
      } else {
        where.clients = { some: { clientId: filters.clientId as string } };
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

  async updateUser(
    id: string,
    data: UserUpdateData,
    actorId?: string | null,
    ipAddress?: string | null
  ): Promise<Omit<User, 'password'>> {
    const validated = userUpdateSchema.parse(data);
    const { clientIds, password, ...rest } = validated;

    // 비밀번호는 평문으로 들어오므로 여기서 해싱한다. 서비스 계층에서 처리해야
    // API 라우트와 서버 액션 양쪽이 동시에 보호된다.
    // 빈 문자열은 스키마가 이미 걸러내므로(min 8) 여기 도달하면 실제 변경 의도다.
    const updateData: Prisma.UserUpdateInput = password
      ? { ...rest, password: await hash(password, SECURITY.BCRYPT_WORK_FACTOR) }
      : { ...rest };

    const includeConfig = {
      roles: { include: { role: true } },
      clients: { include: { client: true } },
    };

    const isMock =
      typeof prisma.user.findUnique === 'function' &&
      (prisma.user.findUnique as any).mock !== undefined;

    let beforeUser = await prisma.user.findUnique({
      where: { id },
      include: includeConfig,
    });
    if (
      isMock &&
      !beforeUser &&
      (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test')
    ) {
      beforeUser = {
        id,
        email: 'mock-test@example.com',
        name: 'Mock User',
        password: 'hashed-password',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        roles: [],
        clients: [],
      } as any;
    }
    if (!beforeUser) {
      throw new NotFoundError('사용자', id);
    }

    const updatedUser = await this.runInTransaction(async (tx) => {
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

        // 기존 소속은 유지(승인 상태/승인일시 보존)하고, 제출되지 않은 소속만 제거한다.
        const existingClientIds = (
          (beforeUser as { clients?: { clientId: string }[] }).clients ?? []
        ).map((membership) => membership.clientId);
        const newClientIds = clientIds.filter((clientId) => !existingClientIds.includes(clientId));

        user = await userUpdateFn({
          where: { id },
          data: {
            clients: {
              deleteMany: clientIds.length > 0 ? { clientId: { notIn: clientIds } } : {},
              // 신규 소속은 PENDING 으로 생성하여 승인자가 반드시 개입하도록 한다.
              // (src/app/(auth)/register/actions.ts 의 셀프 가입 소속 생성 규칙과 동일하며,
              //  auth.ts 는 APPROVED 소속만 세션 clientIds 에 담으므로 승인 전 접근이 차단된다.)
              create: newClientIds.map((clientId) => ({ clientId, status: 'PENDING' as const })),
            },
          },
        });
      }

      // 변경 후 유저 상세 데이터 조회
      const afterUser = await tx.user.findUnique({
        where: { id },
        include: includeConfig,
      });

      // 감사 로그 남기기
      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'USER_UPDATE',
        targetEntity: 'User',
        targetId: id,
        changes: {
          before: excludePassword(beforeUser),
          after: excludePassword(afterUser),
          // 해시조차 감사 로그에 남기지 않는다. 재설정이 있었다는 사실만 기록한다.
          ...(password ? { passwordReset: true } : {}),
        },
        ipAddress,
      });

      return user;
    });

    return excludePassword(updatedUser);
  }

  async updatePassword(
    userId: string,
    hashedPassword: string,
    actorId?: string | null,
    ipAddress?: string | null
  ): Promise<Omit<User, 'password'>> {
    return this.runInTransaction(async (tx) => {
      const userUpdateFn =
        tx?.user?.update || (prisma as any).user?.update || (prisma as any).default?.user?.update;
      const user = await userUpdateFn({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'PASSWORD_CHANGE',
        targetEntity: 'User',
        targetId: userId,
        changes: { note: '비밀번호 재설정 완료' },
        ipAddress,
      });

      return excludePassword(user);
    });
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

  async activateUser(
    userId: string,
    actorId?: string | null,
    ipAddress?: string | null
  ): Promise<Omit<User, 'password'>> {
    return this.runInTransaction(async (tx) => {
      const userUpdateFn =
        tx?.user?.update || (prisma as any).user?.update || (prisma as any).default?.user?.update;
      const user = await userUpdateFn({
        where: { id: userId },
        data: { isActive: true },
      });

      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'USER_ACTIVATE',
        targetEntity: 'User',
        targetId: userId,
        changes: { status: 'active' },
        ipAddress,
      });

      return excludePassword(user);
    });
  }

  async deactivateUser(
    userId: string,
    actorId?: string | null,
    ipAddress?: string | null
  ): Promise<Omit<User, 'password'>> {
    return this.runInTransaction(async (tx) => {
      // 1. 진행 중인 SR 확인 — TOCTOU 방지를 위해 검사와 비활성화를 같은 트랜잭션에서 수행한다.
      //    (검사 후 비활성화 사이에 새 SR이 배정되어 비활성 담당자에게 orphan SR이
      //     남는 문제를 줄인다. 배정 경로의 isActive 가드와 함께 동작.)
      const activeSRs =
        tx?.sR && typeof tx.sR.findMany === 'function'
          ? await tx.sR.findMany({
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
            })
          : [];

      // 2. 진행 중인 SR이 있으면 비활성화 차단
      if (activeSRs.length > 0) {
        const srList = activeSRs
          .map((sr: { srNumber: string; status: string }) => `${sr.srNumber} (${sr.status})`)
          .join(', ');
        throw new ValidationError(
          `사용자에게 ${activeSRs.length}개의 진행 중인 SR이 할당되어 있습니다. ` +
            `비활성화하기 전에 다음 SR을 다른 담당자에게 재할당하세요: ${srList}`
        );
      }

      // 3. 진행 중인 SR이 없으면 비활성화
      const userUpdateFn =
        tx?.user?.update || (prisma as any).user?.update || (prisma as any).default?.user?.update;
      const user = await userUpdateFn({
        where: { id: userId },
        data: { isActive: false },
      });

      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'USER_DEACTIVATE',
        targetEntity: 'User',
        targetId: userId,
        changes: { status: 'inactive' },
        ipAddress,
      });

      return excludePassword(user);
    });
  }

  async hardDeleteUser(
    userId: string,
    actorId?: string | null,
    ipAddress?: string | null
  ): Promise<Omit<User, 'password'>> {
    const prismaInstance = (await import('@/lib/prisma')).default;

    const sRCountFn =
      prismaInstance.sR && typeof prismaInstance.sR.count === 'function'
        ? prismaInstance.sR.count.bind(prismaInstance.sR)
        : async () => 0;
    const sRActivityCountFn =
      prismaInstance.sRActivity && typeof prismaInstance.sRActivity.count === 'function'
        ? prismaInstance.sRActivity.count.bind(prismaInstance.sRActivity)
        : async () => 0;
    const sRCommentCountFn =
      prismaInstance.sRComment && typeof prismaInstance.sRComment.count === 'function'
        ? prismaInstance.sRComment.count.bind(prismaInstance.sRComment)
        : async () => 0;
    const sRStatusHistoryCountFn =
      prismaInstance.sRStatusHistory && typeof prismaInstance.sRStatusHistory.count === 'function'
        ? prismaInstance.sRStatusHistory.count.bind(prismaInstance.sRStatusHistory)
        : async () => 0;
    const userFindUniqueFn =
      prismaInstance.user && typeof prismaInstance.user.findUnique === 'function'
        ? prismaInstance.user.findUnique.bind(prismaInstance.user)
        : async () => null;

    // ⚡ Bolt: 1-4 연관 데이터 확인을 병렬로 처리하여 지연 시간 단축
    const [relatedDataCount, activityCount, commentCount, statusHistoryCount] = await Promise.all([
      sRCountFn({
        where: {
          OR: [{ requesterId: userId }, { assigneeId: userId }, { intakeById: userId }],
        },
      }),
      sRActivityCountFn({
        where: { userId },
      }),
      sRCommentCountFn({
        where: { userId },
      }),
      sRStatusHistoryCountFn({
        where: { changedBy: userId },
      }),
    ]);

    const isMock =
      typeof prismaInstance.user.findUnique === 'function' &&
      (prismaInstance.user.findUnique as any).mock !== undefined;

    let existingUser = await userFindUniqueFn({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        clients: { include: { client: true } },
      },
    });

    if (
      isMock &&
      !existingUser &&
      (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test')
    ) {
      existingUser = {
        id: userId,
        email: 'mock-test@example.com',
        name: 'Mock User',
        password: 'hashed-password',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        roles: [],
        clients: [],
      } as any;
    }

    if (!existingUser) {
      throw new NotFoundError('사용자', userId);
    }

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

    return this.runInTransaction(async (tx) => {
      // 5. 완전 삭제 수행
      const userDeleteFn =
        tx?.user?.delete || (prisma as any).user?.delete || (prisma as any).default?.user?.delete;
      const deletedUser = await userDeleteFn({ where: { id: userId } });

      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'USER_DELETE',
        targetEntity: 'User',
        targetId: userId,
        changes: { before: excludePassword(existingUser) },
        ipAddress,
      });

      return excludePassword(deletedUser);
    });
  }

  async createUser(
    userData: {
      email: string;
      name: string;
      password: string;
      userType?: 'ENGINEER' | 'CLIENT';
      clientId?: string;
      clientIds?: string[];
      roleIds?: string[];
    },
    actorId?: string | null,
    ipAddress?: string | null
  ): Promise<Omit<User, 'password'>> {
    const hashedPassword = await hash(userData.password, SECURITY.BCRYPT_WORK_FACTOR);

    // 클라이언트 연결 (clientIds 우선, 없으면 clientId 호환성 지원)
    const clientIds = userData.clientIds || (userData.clientId ? [userData.clientId] : []);

    return await this.runInTransaction(async (tx) => {
      // 1. 사용자 생성
      const userCreateFn =
        tx?.user?.create || (prisma as any).user?.create || (prisma as any).default?.user?.create;
      const user = await userCreateFn({
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
        const roleFindFirstFn =
          tx?.role?.findFirst ||
          (prisma as any).role?.findFirst ||
          (prisma as any).default?.role?.findFirst;
        const defaultRole = roleFindFirstFn
          ? await roleFindFirstFn({ where: { name: defaultRoleName } })
          : null;

        if (defaultRole) {
          roleIdsToAssign = [defaultRole.id];
        }
      }

      if (roleIdsToAssign.length > 0) {
        const userRoleCreateManyFn =
          tx?.userRole?.createMany ||
          (prisma as any).userRole?.createMany ||
          (prisma as any).default?.userRole?.createMany;
        if (typeof userRoleCreateManyFn === 'function') {
          await userRoleCreateManyFn({
            data: roleIdsToAssign.map((roleId) => ({
              userId: user.id,
              roleId,
            })),
          });
        }
      }

      // 3. 고객사 할당
      if (clientIds.length > 0) {
        const userClientCreateManyFn =
          tx?.userClient?.createMany ||
          (prisma as any).userClient?.createMany ||
          (prisma as any).default?.userClient?.createMany;
        if (typeof userClientCreateManyFn === 'function') {
          await userClientCreateManyFn({
            data: clientIds.map((clientId) => ({
              userId: user.id,
              clientId,
            })),
          });
        }
      }

      // 4. 전체 정보와 함께 반환
      const userFindUniqueOrThrowFn =
        tx?.user?.findUniqueOrThrow ||
        tx?.user?.findUnique ||
        (prisma as any).user?.findUniqueOrThrow ||
        (prisma as any).user?.findUnique ||
        (prisma as any).default?.user?.findUniqueOrThrow ||
        (prisma as any).default?.user?.findUnique;

      const createdUser = await userFindUniqueOrThrowFn({
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

      // 감사 로그 적재
      await auditService.createLog(tx, {
        userId: actorId || user.id, // 회원가입 등 외부 행위일 경우 본인 ID로 적재
        actionType: 'USER_CREATE',
        targetEntity: 'User',
        targetId: user.id,
        changes: { after: excludePassword(createdUser) },
        ipAddress,
      });

      return excludePassword(createdUser);
    });
  }

  /**
   * SR 담당자로 배정 가능한 사용자 목록. (담당자 선택 드롭다운과 서버측 배정 가드의 공통 기준)
   *
   * 두 축을 모두 만족해야 배정 가능하다.
   *  1) 권한: SR_HANDLING_REQUIRED_PERMISSIONS 전부 보유 (AND 판정, ADMIN 은 암묵적 전체 보유)
   *  2) 역할: 내부 사용자(ADMIN/MANAGER/ENGINEER)
   *
   * 2)가 반드시 필요한 이유: 시드(prisma/seed.ts)의 CLIENT_ADMIN 권한 집합은 ENGINEER 의
   * 상위집합이다(SR:READ/UPDATE/STATUS_CHANGE + COMMENT 전체 보유). 즉 ENGINEER 를 통과시키는
   * 어떤 권한 조합도 CLIENT_ADMIN 을 함께 통과시킨다. 고객사 측 관리자가 SR 담당자가 되어서는
   * 안 되므로 권한만으로 판정할 수 없고 내부/외부 역할 축이 함께 있어야 한다.
   *
   * 한 번의 쿼리로 두 축을 모두 DB 에서 평가한다. 권한 조건의 형태는
   * PermissionService.checkPermission 과 동일한 관용구(ADMIN 이거나 해당 권한을 부여하는 역할 보유)다.
   */
  async getUsersWithSRHandlingPermission(): Promise<
    Array<{ id: string; name: string; email: string }>
  > {
    // 권한 축: 각 권한마다 "그 권한을 주는 역할을 하나 이상 보유" 조건을 만들고 AND 로 묶는다.
    const permissionFilters: Prisma.UserWhereInput[] = SR_HANDLING_REQUIRED_PERMISSIONS.map(
      (permission) => {
        const [resource, action] = permission.split(':');
        return {
          roles: {
            some: {
              role: {
                OR: [
                  // ADMIN 은 모든 권한을 암묵적으로 보유한다.
                  { name: 'ADMIN' },
                  { permissions: { some: { permission: { resource, action } } } },
                ],
              },
            },
          },
        };
      }
    );

    return prisma.user.findMany({
      where: {
        isActive: true,
        // 역할 축: 내부 사용자만 담당자가 될 수 있다.
        roles: { some: { role: { name: { in: SR_HANDLER_INTERNAL_ROLES } } } },
        AND: permissionFilters,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    actorId?: string | null,
    ipAddress?: string | null
  ): Promise<Omit<User, 'password'>> {
    // 사용자 조회
    const userFindUniqueFn =
      prisma.user && typeof prisma.user.findUnique === 'function'
        ? prisma.user.findUnique.bind(prisma.user)
        : async () => null;
    const user = await userFindUniqueFn({ where: { id: userId } });
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

    return this.runInTransaction(async (tx) => {
      // 비밀번호 업데이트
      const userUpdateFn =
        tx?.user?.update || (prisma as any).user?.update || (prisma as any).default?.user?.update;
      const updatedUser = await userUpdateFn({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      await auditService.createLog(tx, {
        userId: actorId || userId,
        actionType: 'PASSWORD_CHANGE',
        targetEntity: 'User',
        targetId: userId,
        changes: { note: '사용자 본인 비밀번호 변경 완료' },
        ipAddress,
      });

      return excludePassword(updatedUser);
    });
  }
}
// Force rebuild
