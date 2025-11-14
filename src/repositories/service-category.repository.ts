import { BaseRepository } from './base.repository';
import { ServiceCategory, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { BaseRepositoryImpl } from './base.repository.impl';

export class ServiceCategoryRepository extends BaseRepositoryImpl<ServiceCategory, string, Prisma.ServiceCategoryUncheckedCreateInput, Prisma.ServiceCategoryUncheckedUpdateInput> {
  constructor() {
    super(prisma.serviceCategory);
  }

  async findDetailsById(id: string): Promise<ServiceCategory | null> {
    return this.model.findUnique({
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
    
    return this.model.findMany({
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

  // ServiceCategory 관련 커스텀 메서드들
  async findByClientId(clientId: string): Promise<ServiceCategory[]> {
    return this.model.findMany({
      where: { clientId },
    });
  }

  async findByHandlerId(handlerId: string): Promise<ServiceCategory[]> {
    return this.model.findMany({
      where: { 
        OR: [
          { handlerId },
          { backupHandlerId: handlerId },
        ],
      },
    });
  }
}