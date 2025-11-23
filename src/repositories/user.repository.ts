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
        clients: {
          include: {
            client: true,
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

  async findAllPaginated(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<[User[], number]> {
    const { skip, take, where, orderBy } = params || {};

    return Promise.all([
      this.model.findMany({
        skip,
        take,
        where,
        orderBy,
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          clients: {
            include: {
              client: true,
            },
          },
        },
      }),
      this.model.count({ where }),
    ]);
  }

  // User 관련 커스텀 메서드들
  async findByEmail(email: string): Promise<User | null> {
    return this.model.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: true,
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
      include: {
        roles: {
          include: {
            role: true,
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
    clientId?: string;
  }, params?: {
    skip?: number;
    take?: number;
    orderBy?: any;
  }): Promise<[User[], number]> {
    const where: Prisma.UserWhereInput = {};

    // 검색어 필터
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    // 활성화 상태 필터
    if (filters?.isActive !== null && filters?.isActive !== undefined && filters.isActive !== "all") {
      where.isActive = filters.isActive === "true";
    }

    // 고객사 필터
    if (filters?.clientId && filters.clientId !== "all") {
      where.clients = {
        some: {
          clientId: filters.clientId,
        },
      };
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

    const { skip, take, orderBy } = params || {};

    const [users, total] = await Promise.all([
      this.model.findMany({
        where,
        skip,
        take,
        orderBy: orderBy || { createdAt: "desc" },
        include: {
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
      }),
      this.model.count({ where }),
    ]);

    // 사용자 유형 필터링 (메모리 상에서 처리 - DB 쿼리로 처리하기 복잡함)
    // 주의: 페이지네이션과 함께 사용 시 정확한 페이지네이션이 어려울 수 있음.
    // userType 필터가 있을 경우, DB 레벨에서 최대한 필터링하거나,
    // 클라이언트 요구사항에 따라 userType 필드를 DB에 추가하는 것을 고려해야 함.
    // 현재 구조에서는 userType이 계산된 속성이므로, 전체 데이터를 가져와서 필터링해야 정확하지만,
    // 성능 이슈가 있을 수 있음. 여기서는 일단 가져온 페이지 내에서 필터링하고,
    // 추후 DB 스키마 변경(userType 컬럼 추가)을 제안하는 것이 좋음.

    // 임시: 가져온 데이터에 대해서만 userType 계산
    const usersWithType = users.map((user: any) => ({
      ...user,
      userType: user.clients.length > 0 ? ("CLIENT" as const) : ("ENGINEER" as const),
    }));

    if (filters?.userType && filters.userType !== "all") {
      // 페이지네이션된 결과 내에서 필터링하므로 결과 개수가 줄어들 수 있음.
      // 이는 UX상 이상할 수 있으나, 현재 DB 구조상 최선임.
      const filtered = usersWithType.filter((user: any) => user.userType === filters.userType);
      return [filtered, total]; // total은 전체 개수 유지 (정확하지 않음)
    }

    return [usersWithType, total];
  }

  async updateClientAssociations(userId: string, clientIds: string[]): Promise<void> {
    await this.model.update({
      where: { id: userId },
      data: {
        clients: {
          deleteMany: {},
          create: clientIds.map((clientId) => ({
            clientId,
          })),
        },
      },
    });
  }
}