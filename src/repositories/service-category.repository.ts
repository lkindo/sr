import { BaseRepository } from './base.repository';
import { ServiceCategory, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export class ServiceCategoryRepository implements BaseRepository<ServiceCategory, string, Prisma.ServiceCategoryUncheckedCreateInput, Prisma.ServiceCategoryUncheckedUpdateInput> {
  async findById(id: string): Promise<ServiceCategory | null> {
    return prisma.serviceCategory.findUnique({
      where: { id },
      include: {
        client: true,
        handler: {
          select: { id: true, name: true, email: true },
        },
        backupHandler: {
          select: { id: true, name: true, email: true },
        },
        srs: true,
      },
    });
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.ServiceCategoryWhereInput;
    orderBy?: Prisma.ServiceCategoryOrderByWithRelationInput;
  }): Promise<ServiceCategory[]> {
    const { skip, take, where, orderBy } = params || {};
    
    return prisma.serviceCategory.findMany({
      skip,
      take,
      where,
      orderBy,
      include: {
        client: true,
        handler: {
          select: { id: true, name: true, email: true },
        },
        backupHandler: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async create(data: Prisma.ServiceCategoryUncheckedCreateInput): Promise<ServiceCategory> {
    return prisma.serviceCategory.create({
      data,
    });
  }

  async update(id: string, data: Prisma.ServiceCategoryUncheckedUpdateInput): Promise<ServiceCategory> {
    return prisma.serviceCategory.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<ServiceCategory> {
    return prisma.serviceCategory.delete({
      where: { id },
    });
  }

  // ServiceCategory 관련 커스텀 메서드들
  async findByClientId(clientId: string): Promise<ServiceCategory[]> {
    return prisma.serviceCategory.findMany({
      where: { clientId },
    });
  }

  async findByHandlerId(handlerId: string): Promise<ServiceCategory[]> {
    return prisma.serviceCategory.findMany({
      where: { 
        OR: [
          { handlerId },
          { backupHandlerId: handlerId },
        ],
      },
    });
  }
}