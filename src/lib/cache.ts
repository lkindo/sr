import { unstable_cache as cache } from 'next/cache';

import prisma from '@/lib/prisma';

/**
 * Next.js unstable_cache 기반 캐시 유틸리티
 * Redis 제거 후 간소화된 버전
 */

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
