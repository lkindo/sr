import { NextRequest, NextResponse } from 'next/server';
import { SRPriority, SRStatus } from '@prisma/client';

import { parseJsonBody } from '@/lib/api-helpers';
import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { usePagination } from '@/lib/pagination';
import { ensureCanCreateSR, isInternalUser } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { srCreateSchema } from '@/lib/schemas';
import { serializeResponse } from '@/lib/serialization';
import { srService } from '@/services/sr.service';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/srs - SR 목록 조회 (Rate Limit: 느슨함 - 자주 조회되는 API)
// 페이지네이션 지원: ?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    const { searchParams } = new URL(request.url);
    const { skip, take, orderBy, createResponse } = usePagination(request);

    let clientIdFilter: string | { in: string[] } | undefined =
      searchParams.get('clientId') || undefined;

    // Authorization Check: External users must be restricted to their assigned clients
    if (!isInternalUser(session.user)) {
      const userClientIds = session.user.clientIds || [];

      if (userClientIds.length === 0) {
        // User has no assigned clients -> return empty list
        return NextResponse.json(serializeResponse(createResponse([], 0)));
      }

      if (typeof clientIdFilter === 'string') {
        // User requested a specific client -> verify they have access
        if (!userClientIds.includes(clientIdFilter)) {
          // Unauthorized client -> return empty list
          return NextResponse.json(serializeResponse(createResponse([], 0)));
        }
      } else {
        // No specific client requested -> restrict query to all assigned clients
        clientIdFilter = { in: userClientIds };
      }
    }

    // 필터 파라미터
    const filters = {
      status: (searchParams.get('status') as SRStatus) || undefined,
      clientId: clientIdFilter,
      priority: (searchParams.get('priority') as SRPriority) || undefined,
    };

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
