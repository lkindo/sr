import { NextRequest, NextResponse } from 'next/server';
import { Prisma, SRPriority, SRStatus } from '@prisma/client';
import { z } from 'zod';

import { parseJsonBody } from '@/lib/api-helpers';
import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { SORTABLE_FIELDS, usePagination } from '@/lib/pagination';
import { ensureCanCreateSR, resolveAssigneeScope, resolveClientIdFilter } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SR_ALIVE } from '@/lib/prisma-selects';
import { srCreateSchema } from '@/lib/schemas';
import { serializeResponse } from '@/lib/serialization';
import { srService } from '@/services/sr.service';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 목록 필터 쿼리 파라미터.
 *
 * 예전에는 `searchParams.get('status') as SRStatus` 로 **검증 없이 캐스팅**했다(감사 4.3).
 * `?status=FOO` 는 그대로 Prisma 에 도달해 `PrismaClientValidationError` 를 일으켰고,
 * 그 오류는 500 으로 매핑되면서 모델명·필드 목록이 담긴 원문 메시지를 응답에 실었다.
 * 400 이어야 할 것이 5xx + 스키마 유출이었다.
 *
 * 빈 문자열(`?status=`)은 "필터 없음"으로 취급한다 — UI 의 Select 가 전체 선택 시
 * 빈 값을 붙여 보내는 경우가 있어, 이를 오류로 만들면 정상 사용이 깨진다.
 */
const srListQuerySchema = z.object({
  status: z.preprocess((v) => v || undefined, z.nativeEnum(SRStatus).optional()),
  priority: z.preprocess((v) => v || undefined, z.nativeEnum(SRPriority).optional()),
  clientId: z.preprocess((v) => v || undefined, z.string().max(30).optional()),
});

// GET /api/srs - SR 목록 조회 (Rate Limit: 느슨함 - 자주 조회되는 API)
// 페이지네이션 지원: ?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    const { searchParams } = new URL(request.url);
    const { skip, take, orderBy, createResponse } = usePagination(request, SORTABLE_FIELDS.srs);

    // 잘못된 값은 여기서 ZodError 로 끝난다. handleApiError 가 400 으로 매핑한다.
    const query = srListQuerySchema.parse({
      status: searchParams.get('status'),
      priority: searchParams.get('priority'),
      clientId: searchParams.get('clientId'),
    });

    const clientIdFilter = resolveClientIdFilter(session.user, query.clientId);
    if (typeof clientIdFilter === 'object' && clientIdFilter.in.length === 0) {
      return NextResponse.json(serializeResponse(createResponse([], 0)));
    }

    // 필터 파라미터 (전부 위 스키마를 통과한 값이다)
    const filters: Prisma.SRWhereInput = {
      ...SR_ALIVE,
      status: query.status,
      clientId: clientIdFilter,
      priority: query.priority,
    };

    // 담당자 스코프 — ENGINEER 는 배정된 SR 만 본다(canReadSR 과 같은 규칙).
    // 이게 없으면 목록에는 보이는데 상세는 403 인 행이 생기고, 그 자체가 제목·고객사명
    // 노출이다. undefined 면 Prisma 가 조건을 걸지 않는다.
    const assigneeScope = resolveAssigneeScope(session.user);
    if (assigneeScope) {
      filters.assigneeId = assigneeScope;
    }

    const [srs, totalCount] = await Promise.all([
      srService.getAllSRs({
        where: filters,
        skip,
        take,
        orderBy: orderBy as import('@prisma/client').Prisma.SROrderByWithRelationInput,
      }),
      prisma.sR.count({ where: filters }),
    ]);

    const result = createResponse(srs, totalCount);

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
    // Optimize: Use in-memory check via policy function instead of DB query
    ensureCanCreateSR(session.user);

    const body = await parseJsonBody(request);

    // Zod validation을 먼저 수행하여 잘못된 페이로드에 대해 400 Bad Request 유도
    const validated = srCreateSchema.parse(body);

    // Multi-tenant Spoofing Prevention 은 srService.createSR 내부에서 일괄 처리한다.
    // (Server Action 경로도 동일한 규칙을 적용받도록 서비스 계층에 단일화)
    const sr = await srService.createSR(validated, session.user);

    return NextResponse.json(serializeResponse(sr), { status: 201 });
  },
  { preset: 'standard' }
); // 1분당 100회
