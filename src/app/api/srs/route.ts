import { NextRequest, NextResponse } from 'next/server';
import { SRPriority, SRStatus } from '@prisma/client';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { isCacheAvailable, withCache } from '@/lib/cache';
import { getSrsListTtlSeconds, shouldWideInvalidate } from '@/lib/cache-config';
import {
  DASHBOARD_STATS_PREFIX,
  srListKey,
  srListPatternForClient,
  srListPatternForPriority,
} from '@/lib/cache-keys';
import { sendSRCreatedEmail } from '@/lib/email';
import { ForbiddenError } from '@/lib/errors';
import { usePagination } from '@/lib/pagination';
import prisma from '@/lib/prisma';
import { invalidateCachePattern } from '@/lib/redis-cache';
import { serializeResponse } from '@/lib/serialization';
import { PermissionService } from '@/services/permission.service';
import { SRService } from '@/services/sr.service';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/srs - SR 목록 조회 (Rate Limit: 느슨함 - 자주 조회되는 API)
// 페이지네이션 지원: ?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc
export const GET = withAuthAndRateLimit(
  async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);

    // 필터 파라미터
    const filters = {
      status: (searchParams.get('status') as SRStatus) || undefined,
      clientId: searchParams.get('clientId') || undefined,
      priority: (searchParams.get('priority') as SRPriority) || undefined,
    };

    // 페이지네이션 파라미터
    const { skip, take, orderBy, createResponse } = usePagination(request);

    const srService = new SRService();

    // 캐시 키: 필터 기반 (페이지네이션은 캐시 키에서 제외)
    const cacheKey = srListKey(filters);

    const fetchData = async () => {
      const [srs, totalCount] = await Promise.all([
        srService.getAllSRs({
          where: filters,
          skip,
          take,
          orderBy: orderBy as import('@prisma/client').Prisma.SROrderByWithRelationInput,
        }),
        prisma.sR.count({ where: filters }),
      ]);

      return createResponse(srs, totalCount);
    };

    const result = isCacheAvailable()
      ? await withCache(cacheKey, fetchData, {
          ttlSeconds: getSrsListTtlSeconds(),
          namespace: 'sr',
        })
      : await fetchData();

    // Date 객체를 문자열로 변환 (직렬화 문제 해결)
    return NextResponse.json(serializeResponse(result));
  },
  { preset: 'relaxed' }
); // 1분당 300회 (읽기 전용, 자주 조회됨)

// POST /api/srs - 새 SR 생성 (Rate Limit: 표준)
// SR:CREATE 권한이 있는 사용자만 SR 등록 가능
export const POST = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    // 권한 체크: SR:CREATE 권한 필요
    const permissionService = new PermissionService();
    const hasPermission = await permissionService.checkPermission(session.user.id, 'SR:CREATE');

    if (!hasPermission) {
      throw new ForbiddenError('SR 등록 권한이 없습니다. SR:CREATE 권한이 필요합니다.');
    }

    const body = await request.json();
    const srService = new SRService();
    const sr = await srService.createSR(body, session.user);

    // Send email notification to MANAGER role users (non-blocking)
    if (process.env.RESEND_API_KEY) {
      // MANAGER 역할을 가진 활성 사용자들 조회
      prisma.user
        .findMany({
          where: {
            isActive: true,
            roles: {
              some: {
                role: {
                  name: 'MANAGER',
                },
              },
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        })
        .then((managers) => {
          // 각 MANAGER에게 메일 발송
          managers.forEach((manager) => {
            if (manager.email) {
              sendSRCreatedEmail({
                to: manager.email,
                srId: sr.id,
                srNumber: sr.srNumber,
                title: sr.title,
                description: sr.description,
                priority: sr.priority || sr.requestedPriority || 'MEDIUM',
                clientName: sr.client?.name || '',
                requesterName: sr.requester?.name || '',
                requesterEmail: sr.requester?.email || '',
              }).catch((error) => {
                console.error(
                  `Failed to send SR created email to manager ${manager.email}:`,
                  error
                );
              });
            }
          });
        })
        .catch((error) => {
          console.error('Failed to fetch MANAGER users:', error);
        });
    }

    // 캐시 무효화: 목록/대시보드 관련 키
    try {
      const wide = shouldWideInvalidate();
      // 클라이언트/우선순위 조건부 무효화 (wide 모드면 전체)
      if (!wide && sr.client?.id)
        await invalidateCachePattern(srListPatternForClient(sr.client.id));
      if (!wide && sr.priority)
        await invalidateCachePattern(srListPatternForPriority(sr.priority as string));
      if (wide || !sr.client?.id) await invalidateCachePattern('sr:list:*');
      await invalidateCachePattern(`${DASHBOARD_STATS_PREFIX}*`);
    } catch (e) {
      console.warn('Cache invalidation failed after SR create:', e);
    }

    return NextResponse.json(serializeResponse(sr), { status: 201 });
  },
  { preset: 'standard' }
); // 1분당 100회
