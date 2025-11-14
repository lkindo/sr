import { BaseRepository } from './base.repository';
import { Client, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export class ClientRepository implements BaseRepository<Client, string, Prisma.ClientUncheckedCreateInput, Prisma.ClientUncheckedUpdateInput> {
  async findById(id: string): Promise<Client | null> {
    return prisma.client.findUnique({
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
    
    return prisma.client.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  async create(data: Prisma.ClientUncheckedCreateInput): Promise<Client> {
    return prisma.client.create({
      data,
    });
  }

  async createGeneric(data: Partial<Client>): Promise<Client> {
    return prisma.client.create({
      data: data as Prisma.ClientUncheckedCreateInput,
    });
  }

  async update(id: string, data: Prisma.ClientUncheckedUpdateInput): Promise<Client> {
    return prisma.client.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<Client> {
    return prisma.client.delete({
      where: { id },
    });
  }

  // Client 관련 커스텀 메서드들
  async findByCode(code: string): Promise<Client | null> {
    return prisma.client.findUnique({
      where: { code },
    });
  }

  async findByName(name: string): Promise<Client | null> {
    return prisma.client.findFirst({
      where: { name: { contains: name, mode: 'insensitive' } },
    });
  }

  async findByUserId(userId: string): Promise<Client[]> {
    return prisma.client.findMany({
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
    return prisma.client.update({
      where: { id: clientId },
      data: { isActive: true },
    });
  }

  async deactivateClient(clientId: string): Promise<Client> {
    return prisma.client.update({
      where: { id: clientId },
      data: { isActive: false },
    });
  }
}