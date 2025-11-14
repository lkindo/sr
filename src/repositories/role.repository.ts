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
  }): Promise<Role[]> {
    const { skip, take, where, orderBy } = params || {};
    
    return this.model.findMany({
      skip,
      take,
      where,
      orderBy,
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
}