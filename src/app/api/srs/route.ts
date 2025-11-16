import { NextRequest, NextResponse } from "next/server";
import { SRService, getAllSrs, createSr } from "@/services/sr.service";
import { sendSRCreatedEmail } from "@/lib/email";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { PermissionService } from "@/services/permission.service";
import { ForbiddenError } from "@/lib/errors";
import prisma from "@/lib/prisma";
import { withCache, isCacheAvailable } from "@/lib/cache";
import { invalidateCachePattern } from "@/lib/redis-cache";
import { srListKey, DASHBOARD_STATS_PREFIX, srListPatternForClient, srListPatternForPriority } from "@/lib/cache-keys";
import { getSrsListTtlSeconds, shouldWideInvalidate } from "@/lib/cache-config";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/srs - SR 목록 조회 (Rate Limit: 느슨함 - 자주 조회되는 API)
export const GET = withAuthAndRateLimit(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const filters = {
    status: searchParams.get("status") || undefined,
    clientId: searchParams.get("clientId") || undefined,
    priority: searchParams.get("priority") || undefined,
  };

  // 캐시 키: 필터 조합 기반 (읽기 전용, 짧은 TTL)
  const cacheKey = srListKey(filters);
  const srs = isCacheAvailable()
    ? await withCache(cacheKey, async () => await getAllSrs(filters), { ttlSeconds: getSrsListTtlSeconds(), namespace: 'sr' })
    : await getAllSrs(filters);

  // Date 객체를 문자열로 변환 (직렬화 문제 해결)
  const serializableSrs = srs.map(sr => ({
    ...sr,
    createdAt: sr.createdAt.toISOString(),
    updatedAt: sr.updatedAt.toISOString(),
    dueDate: sr.dueDate ? sr.dueDate.toISOString() : null,
    requestedCompletionDate: sr.requestedCompletionDate ? sr.requestedCompletionDate.toISOString() : null,
  }));

  return NextResponse.json(serializableSrs);
}, { preset: 'relaxed' }); // 1분당 300회 (읽기 전용, 자주 조회됨)

// POST /api/srs - 새 SR 생성 (Rate Limit: 표준)
// SR:CREATE 권한이 있는 사용자만 SR 등록 가능
export const POST = withAuthAndRateLimit(async (request: NextRequest, { session }) => {
  // 권한 체크: SR:CREATE 권한 필요
  const permissionService = new PermissionService();
  const hasPermission = await permissionService.checkPermission(session.user.id, 'SR:CREATE');
  
  if (!hasPermission) {
    throw new ForbiddenError("SR 등록 권한이 없습니다. SR:CREATE 권한이 필요합니다.");
  }

  const body = await request.json();
  const sr = await createSr(body, session.user);

  // Send email notification to MANAGER role users (non-blocking)
  if (process.env.RESEND_API_KEY) {
    // MANAGER 역할을 가진 활성 사용자들 조회
    prisma.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: {
            role: {
              name: "MANAGER",
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    }).then((managers) => {
      // 각 MANAGER에게 메일 발송
      managers.forEach((manager) => {
        if (manager.email) {
          sendSRCreatedEmail({
            to: manager.email,
            srId: sr.id,
            srNumber: sr.srNumber,
            title: sr.title,
            description: sr.description,
            priority: sr.priority || sr.requestedPriority || "MEDIUM",
            clientName: sr.client?.name || "",
            requesterName: sr.requester?.name || "",
            requesterEmail: sr.requester?.email || "",
          }).catch((error) => {
            console.error(`Failed to send SR created email to manager ${manager.email}:`, error);
          });
        }
      });
    }).catch((error) => {
      console.error("Failed to fetch MANAGER users:", error);
    });
  }

  const serializableSr = {
    ...sr,
    createdAt: sr.createdAt.toISOString(),
    updatedAt: sr.updatedAt.toISOString(),
    dueDate: sr.dueDate ? sr.dueDate.toISOString() : null,
    requestedCompletionDate: sr.requestedCompletionDate ? sr.requestedCompletionDate.toISOString() : null,
  };

  // 캐시 무효화: 목록/대시보드 관련 키
  try {
    const wide = shouldWideInvalidate()
    // 클라이언트/우선순위 조건부 무효화 (wide 모드면 전체)
    if (!wide && sr.client?.id) await invalidateCachePattern(srListPatternForClient(sr.client.id))
    if (!wide && sr.priority) await invalidateCachePattern(srListPatternForPriority(sr.priority as string))
    if (wide || !sr.client?.id) await invalidateCachePattern('sr:list:*')
    await invalidateCachePattern(`${DASHBOARD_STATS_PREFIX}*`);
  } catch (e) {
    console.warn('Cache invalidation failed after SR create:', e);
  }

  return NextResponse.json(serializableSr, { status: 201 });
}, { preset: 'standard' }); // 1분당 100회

