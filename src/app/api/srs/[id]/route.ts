import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SRService } from "@/services/sr.service";
import { srUpdateSchema } from "@/lib/schemas";
import { withAuthAndRateLimit, AuthenticatedContext } from "@/lib/auth-wrapper";
import { NotFoundError } from "@/lib/errors";
import { validateRequestBody, RouteContext } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";
import { withCache, isCacheAvailable } from "@/lib/cache";
import { invalidateCache, invalidateCachePattern } from "@/lib/redis-cache";
import { srDetailKey, SR_LIST_PREFIX, DASHBOARD_STATS_PREFIX, MY_REQUESTS_PREFIX, srListPatternForClient, srListPatternForStatus, srListPatternForPriority } from "@/lib/cache-keys";
import { getSrsDetailTtlSeconds, shouldWideInvalidate } from "@/lib/cache-config";
import { serializeResponse } from "@/lib/serialization";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/srs/[id] - SR 상세 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (
  request: NextRequest,
  { session, params }: AuthenticatedContext<RouteContext<{ id: string }>["params"]>
) => {
  const { id } = await params;

  // Service 레이어를 통해 SR 조회
  const srService = new SRService();
  const cacheKey = srDetailKey(id);
  const sr = await (isCacheAvailable()
    ? withCache(cacheKey, async () => await srService.getSRDetailsById(id), { ttlSeconds: getSrsDetailTtlSeconds(), namespace: 'sr' })
    : srService.getSRDetailsById(id));

  if (!sr) {
    throw new NotFoundError("SR을 찾을 수 없습니다.");
  }

  // 날짜 객체를 문자열로 변환 (JSON 직렬화를 위해)
  return NextResponse.json(serializeResponse(sr));
}, { preset: 'standard' }); // 1분당 100회

// PATCH /api/srs/[id] - SR 수정 (Rate Limit: 엄격)
// 권한 체크는 서비스 레이어에서 처리 (REQUESTED 상태: 요청자 또는 ADMIN, 기타: ADMIN만)
export const PATCH = withAuthAndRateLimit(async (
  request: NextRequest,
  { session, params }: AuthenticatedContext<RouteContext<{ id: string }>["params"]>
) => {
  const { id } = await params;
  const validated = await validateRequestBody(request, srUpdateSchema);

  // Service 레이어를 통해 SR 수정 (권한 체크 포함)
  const srService = new SRService();
  const updatedSR = await srService.updateSR(id, validated, session.user);

  // 캐시 무효화: 상세/목록/대시보드/내요청 (병렬 처리)
  try {
    const wide = shouldWideInvalidate();

    const cacheInvalidations = [
      invalidateCache(srDetailKey(id)),
      invalidateCachePattern(`${DASHBOARD_STATS_PREFIX}*`),
      invalidateCachePattern(`${MY_REQUESTS_PREFIX}*`),
    ];

    // wide 모드에 따라 추가 무효화
    if (!wide && (updatedSR as any).client?.id) {
      cacheInvalidations.push(invalidateCachePattern(srListPatternForClient((updatedSR as any).client.id)));
    }
    if (!wide && (updatedSR as any).status) {
      cacheInvalidations.push(invalidateCachePattern(srListPatternForStatus((updatedSR as any).status)));
    }
    if (!wide && (updatedSR as any).priority) {
      cacheInvalidations.push(invalidateCachePattern(srListPatternForPriority((updatedSR as any).priority)));
    }
    if (wide || !(updatedSR as any).client?.id) {
      cacheInvalidations.push(invalidateCachePattern(`${SR_LIST_PREFIX}*`));
    }

    await Promise.all(cacheInvalidations);
  } catch (e) {
    console.warn('Cache invalidation failed after SR patch:', e);
  }

  return NextResponse.json(updatedSR);
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)

// DELETE /api/srs/[id] - SR 삭제 (Rate Limit: 엄격)
export const DELETE = withAuthAndRateLimit(async (
  request: NextRequest,
  { session, params }: AuthenticatedContext<RouteContext<{ id: string }>["params"]>
) => {
  const { id } = await params;

  // Service 레이어를 통해 SR 삭제
  const srService = new SRService();
  const result = await srService.deleteSR(id, session.user);

  // 캐시 무효화: 상세/목록/대시보드/내요청 (병렬 처리)
  try {
    await Promise.all([
      invalidateCache(srDetailKey(id)),
      invalidateCachePattern(`${SR_LIST_PREFIX}*`),
      invalidateCachePattern(`${DASHBOARD_STATS_PREFIX}*`),
      invalidateCachePattern(`${MY_REQUESTS_PREFIX}*`),
    ]);
  } catch (e) {
    console.warn('Cache invalidation failed after SR delete:', e);
  }

  return NextResponse.json(result);
}, { preset: 'strict' }); // 1분당 5회 (삭제는 민감한 작업)
