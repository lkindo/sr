import { BaseRepository } from './base.repository';
import { User, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { BaseRepositoryImpl } from './base.repository.impl';

export class UserRepository extends BaseRepositoryImpl<User, string, Prisma.UserUncheckedCreateInput, Prisma.UserUncheckedUpdateInput> {
  constructor() {
    super(prisma.user);
  }

  async findDetailsById(id: string): Promise<User | null> {
    return this.model.findUnique({
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

  async findAllDetails(): Promise<(User & {
    roles: {
      role: {
        id: string;
        name: string;
        description?: string | null;
        createdAt: Date;
        updatedAt: Date;
        permissions: {
          permission: {
            id: string;
            resource: string;
            action: string;
            description?: string | null;
          };
        }[];
      };
    }[];
  })[]> {
    return this.model.findMany({
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
      },
      where: {
        isActive: true, // Only active users
      },
      orderBy: {
        name: "asc",
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
    
    return this.model.findMany({
      skip,
      take,
      where,
      orderBy,
    });
  }

  // User 관련 커스텀 메서드들
  async findByEmail(email: string): Promise<User | null> {
    return this.model.findUnique({
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
    return this.model.findMany({
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
    return this.model.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  async updateProfile(userId: string, profileData: {
    name?: string;
    email?: string;
    image?: string;
  }): Promise<User> {
    return this.model.update({
      where: { id: userId },
      data: profileData,
    });
  }

  async activateUser(userId: string): Promise<User> {
    return this.model.update({
      where: { id: userId },
      data: { isActive: true },
    });
  }

  async deactivateUser(userId: string): Promise<User> {
    return this.model.update({
      where: { id: userId },
      data: { isActive: false },
    });
  }
}