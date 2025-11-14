import { BaseRepository } from './base.repository';
import { Permission, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export class PermissionRepository implements BaseRepository<Permission, string, Prisma.PermissionUncheckedCreateInput, Prisma.PermissionUncheckedUpdateInput> {
  async findById(id: string): Promise<Permission | null> {
    return prisma.permission.findUnique({
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
    
    return prisma.permission.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  async create(data: Prisma.PermissionUncheckedCreateInput): Promise<Permission> {
    return prisma.permission.create({
      data,
    });
  }

  async update(id: string, data: Prisma.PermissionUncheckedUpdateInput): Promise<Permission> {
    return prisma.permission.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Permission> {
    return prisma.permission.delete({
      where: { id },
    });
  }

  // Permission 관련 커스텀 메서드들
  async findByResourceAndAction(resource: string, action: string): Promise<Permission | null> {
    return prisma.permission.findUnique({
      where: {
        resource_action: {
          resource,
          action,
        },
      },
    });
  }

  async findByRoleId(roleId: string): Promise<Permission[]> {
    return prisma.permission.findMany({
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
    return prisma.permission.findMany({
      where: { resource },
    });
  }
}