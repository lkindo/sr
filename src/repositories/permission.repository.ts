import { BaseRepository } from './base.repository';
import { Permission, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { BaseRepositoryImpl } from './base.repository.impl';

export class PermissionRepository extends BaseRepositoryImpl<Permission, string, Prisma.PermissionUncheckedCreateInput, Prisma.PermissionUncheckedUpdateInput> {
  constructor() {
    super(prisma.permission);
  }

  async findDetailsById(id: string): Promise<Permission | null> {
    return this.model.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.PermissionWhereInput;
    orderBy?: Prisma.PermissionOrderByWithRelationInput;
  }): Promise<Permission[]> {
    const { skip, take, where, orderBy } = params || {};

    return this.model.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  // Permission 관련 커스텀 메서드들
  async findByResourceAndAction(resource: string, action: string): Promise<Permission | null> {
    return this.model.findUnique({
      where: {
        resource_action: {
          resource,
          action,
        },
      },
    });
  }

  async findByRoleId(roleId: string): Promise<Permission[]> {
    return this.model.findMany({
      where: {
        roles: {
          some: {
            roleId,
          },
        },
      },
    });
  }

  async findByResource(resource: string): Promise<Permission[]> {
    return this.model.findMany({
      where: { resource },
    });
  }
}