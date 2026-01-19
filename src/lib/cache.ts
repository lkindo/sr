import { unstable_cache as cache } from 'next/cache';
import type { Prisma } from '@prisma/client';

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

type CacheOptions = {
  ttlSeconds?: number;
  namespace?: string;
};

// Redis 제거로 인해 항상 null (No-op)
const redis: null = null;

const metrics = {
  hit: 0,
  miss: 0,
  set: 0,
  invalidate: 0,
};

function buildKey(key: string, namespace?: string) {
  return namespace ? `${namespace}:${key}` : key;
}

export async function cacheGet<T>(key: string, options?: CacheOptions): Promise<T | null> {
  // 항상 Cache Miss
  metrics.miss++;
  return null;
}

export async function cacheSet<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
  // No-op
  metrics.set++;
}

export async function withCache<T>(
  key: string,
  compute: () => Promise<T>,
  options?: CacheOptions
): Promise<T> {
  // 항상 compute 실행 (Caching Disabled)
  const value = await compute();
  return value;
}

export function isCacheAvailable(): boolean {
  return false;
}

export function getCacheMetrics() {
  return { ...metrics };
}

// SR 목록 캐싱 (Next.js unstable_cache 사용 - 이는 유지됨)
export const getCachedSRs = cache(
  async (params: {
    where?: Prisma.SRWhereInput;
    orderBy?: Prisma.SROrderByWithRelationInput;
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
          },
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        serviceCategory: {
          select: {
            id: true,
            categoryName: true,
          },
        },
      },
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
          },
        },
        backupHandler: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  },
  ['service-categories'],
  { revalidate: 600 } // 10분마다 갱신
);
