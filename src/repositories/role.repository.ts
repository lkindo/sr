import { BaseRepository } from './base.repository';
import { Role, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export class RoleRepository implements BaseRepository<Role, string, Prisma.RoleUncheckedCreateInput, Prisma.RoleUncheckedUpdateInput> {
  async findById(id: string): Promise<Role | null> {
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
    
    return prisma.role.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  async create(data: Prisma.RoleUncheckedCreateInput): Promise<Role> {
    return prisma.role.create({
      data,
    });
  }

  async update(id: string, data: Prisma.RoleUncheckedUpdateInput): Promise<Role> {
    return prisma.role.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Role> {
    return prisma.role.delete({
      where: { id },
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