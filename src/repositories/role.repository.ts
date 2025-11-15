import { BaseRepository } from './base.repository';
import { Role, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { BaseRepositoryImpl } from './base.repository.impl';

export class RoleRepository extends BaseRepositoryImpl<Role, string, Prisma.RoleUncheckedCreateInput, Prisma.RoleUncheckedUpdateInput> {
  constructor() {
    super(prisma.role);
  }

  async findDetailsById(id: string): Promise<Role | null> {
    return prisma.role.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            user: true,
          },
        },
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.RoleWhereInput;
    orderBy?: Prisma.RoleOrderByWithRelationInput;
  }): Promise<(Role & {
    permissions: Array<{
      permission: {
        id: string;
        resource: string;
        action: string;
        description: string | null;
      };
    }>;
    _count: {
      users: number;
    };
  })[]> {
    const { skip, take, where, orderBy } = params || {};
    
    return this.model.findMany({
      skip,
      take,
      where,
      orderBy,
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: {
            users: true,
          },
        },
      },
    });
  }

  // Role 관련 커스텀 메서드들
  async findByName(name: string): Promise<Role | null> {
    return prisma.role.findUnique({
      where: { name },
    });
  }

  async findByUserId(userId: string): Promise<Role[]> {
    return prisma.role.findMany({
      where: {
        users: {
          some: {
            userId,
          },
        },
      },
    });
  }

  // 참조 무결성 확인 메서드
  async getRelatedDataCounts(roleId: string): Promise<{
    usersCount: number;
    permissionsCount: number;
  }> {
    const [usersCount, permissionsCount] = await Promise.all([
      prisma.userRole.count({ where: { roleId } }),
      prisma.rolePermission.count({ where: { roleId } }),
    ]);

    return { usersCount, permissionsCount };
  }

  // 역할 권한 관리 메서드
  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    // 트랜잭션으로 원자적 처리
    await prisma.$transaction(async (tx) => {
      // 기존 권한 연결 모두 삭제
      await tx.rolePermission.deleteMany({
        where: { roleId },
      });

      // 새 권한 연결 생성
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map(permissionId => ({
            roleId,
            permissionId,
          })),
        });
      }
    });
  }
}