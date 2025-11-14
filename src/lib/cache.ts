import { unstable_cache as cache } from 'next/cache';
import prisma from './prisma';

// SR 목록 캐싱
export const getCachedSRs = cache(
  async (params: { 
    where?: any; 
    orderBy?: any; 
    skip?: number; 
    take?: number;
  }) => {
    const { where, orderBy, skip, take } = params;
    return prisma.sR.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          }
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        serviceCategory: {
          select: {
            id: true,
            categoryName: true,
          }
        },
      }
    });
  },
  ['srs'],
  { revalidate: 300 } // 5분마다 갱신
);

// 사용자 목록 캐싱
export const getCachedUsers = cache(
  async () => {
    return prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  },
  ['users'],
  { revalidate: 300 } // 5분마다 갱신
);

// 고객사 목록 캐싱
export const getCachedClients = cache(
  async () => {
    return prisma.client.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  },
  ['clients'],
  { revalidate: 300 } // 5분마다 갱신
);

// 권한 목록 캐싱
export const getCachedPermissions = cache(
  async () => {
    return prisma.permission.findMany();
  },
  ['permissions'],
  { revalidate: 600 } // 10분마다 갱신
);

// 서비스 카테고리 목록 캐싱
export const getCachedServiceCategories = cache(
  async () => {
    return prisma.serviceCategory.findMany({
      where: { isActive: true },
      include: {
        handler: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        backupHandler: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
      }
    });
  },
  ['service-categories'],
  { revalidate: 600 } // 10분마다 갱신
);