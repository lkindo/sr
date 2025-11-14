import { BaseRepository } from './base.repository';
import { Client, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { BaseRepositoryImpl } from './base.repository.impl';

export class ClientRepository extends BaseRepositoryImpl<Client, string, Prisma.ClientUncheckedCreateInput, Prisma.ClientUncheckedUpdateInput> {
  constructor() {
    super(prisma.client);
  }

  async findDetailsById(id: string): Promise<Client | null> {
    return this.model.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            user: true,
          },
        },
        srs: true,
        serviceCategories: true,
        clientHandlers: {
          include: {
            user: true,
            backupHandler: true,
          },
        },
      },
    });
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.ClientWhereInput;
    orderBy?: Prisma.ClientOrderByWithRelationInput;
  }): Promise<Client[]> {
    const { skip, take, where, orderBy } = params || {};
    
    return this.model.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  // Client 관련 커스텀 메서드들
  async findByCode(code: string): Promise<Client | null> {
    return this.model.findUnique({
      where: { code },
    });
  }

  async findByName(name: string): Promise<Client | null> {
    return this.model.findFirst({
      where: { name: { contains: name, mode: 'insensitive' } },
    });
  }

  async findByUserId(userId: string): Promise<Client[]> {
    return this.model.findMany({
      where: {
        users: {
          some: {
            userId,
          },
        },
      },
    });
  }

  async activateClient(clientId: string): Promise<Client> {
    return this.model.update({
      where: { id: clientId },
      data: { isActive: true },
    });
  }

  async deactivateClient(clientId: string): Promise<Client> {
    return this.model.update({
      where: { id: clientId },
      data: { isActive: false },
    });
  }
}