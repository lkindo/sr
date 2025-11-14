import { BaseRepository } from './base.repository';
import { User, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export class UserRepository implements BaseRepository<User, string, Prisma.UserUncheckedCreateInput, Prisma.UserUncheckedUpdateInput> {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        clients: {
          include: {
            client: true,
          },
        },
      },
    });
  }

  async findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    const { skip, take, where, orderBy } = params || {};
    
    return prisma.user.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  async create(data: Prisma.UserUncheckedCreateInput): Promise<User> {
    return prisma.user.create({
      data,
    });
  }

  async update(id: string, data: Prisma.UserUncheckedUpdateInput): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<User> {
    return prisma.user.delete({
      where: { id },
    });
  }

  // User 관련 커스텀 메서드들
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        clients: {
          include: {
            client: true,
          },
        },
      },
    });
  }

  async findByClientId(clientId: string): Promise<User[]> {
    return prisma.user.findMany({
      where: {
        clients: {
          some: {
            clientId,
          },
        },
      },
    });
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  async updateProfile(userId: string, profileData: {
    name?: string;
    email?: string;
    image?: string;
  }): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: profileData,
    });
  }

  async activateUser(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });
  }

  async deactivateUser(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
  }
}