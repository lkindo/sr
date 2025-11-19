import { BaseRepository } from './base.repository';
import { User, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { BaseRepositoryImpl } from './base.repository.impl';

export class UserRepository extends BaseRepositoryImpl<User, string, Prisma.UserUncheckedCreateInput, Prisma.UserUncheckedUpdateInput> {
  constructor() {
    super(prisma.user as any);
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

  async findAllWithFilters(filters?: {
    search?: string;
    isActive?: string;
    userType?: string;
    roleId?: string;
    role?: string;
  }): Promise<User[]> {
    const where: Prisma.UserWhereInput = {};

    // 검색어 필터
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { email: { contains: filters.search } },
      ];
    }

    // 활성화 상태 필터
    if (filters?.isActive !== null && filters?.isActive !== undefined && filters.isActive !== "") {
      where.isActive = filters.isActive === "true";
    }

    // 역할 ID 필터
    if (filters?.roleId && filters.roleId !== "all") {
      where.roles = {
        some: {
          roleId: filters.roleId,
        },
      };
    }

    // 역할 이름 필터
    if (filters?.role) {
      const roleNames = filters.role.split(",");
      where.roles = {
        some: {
          role: {
            name: {
              in: roleNames,
            },
          },
        },
      };
    }

    const users = await this.model.findMany<User & {
      roles: { role: import("@prisma/client").Role }[];
      clients: { client: { id: string; name: string; code: string } }[];
    }>({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          include: {
            role: true,
          },
        },
        clients: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // 사용자 유형 결정 (클라이언트가 있으면 CLIENT, 없으면 ENGINEER)
    type UserWithType = typeof users[number] & { userType: "CLIENT" | "ENGINEER" };
    let usersWithType: UserWithType[] = users.map((user: typeof users[number]): UserWithType => ({
      ...user,
      userType: user.clients.length > 0 ? ("CLIENT" as const) : ("ENGINEER" as const),
    }));

    // 유형별 필터링
    if (filters?.userType && filters.userType !== "all") {
      usersWithType = usersWithType.filter((user) => user.userType === filters.userType);
    }

    return usersWithType;
  }
}