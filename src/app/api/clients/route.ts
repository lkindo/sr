import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

import { validateRequestBody } from '@/lib/api-helpers';
import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { usePagination } from '@/lib/pagination';
import { ensureCanCreateClient, ensureCanReadClient, isInternalUser } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { clientCreateSchema } from '@/lib/schemas';
import { ClientService } from '@/services/client.service';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/clients - 모든 고객사 조회 (Rate Limit: 표준)
// 페이지네이션 지원: ?page=1&pageSize=20&sortBy=name&sortOrder=asc
// GET /api/clients - 모든 고객사 조회 (Rate Limit: 표준)
// 페이지네이션 지원: ?page=1&pageSize=20&sortBy=name&sortOrder=asc
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    ensureCanReadClient(session.user);

    const { searchParams } = new URL(request.url);
    const { skip, take, orderBy, createResponse } = usePagination(request);

    const search = searchParams.get('search');
    const industry = searchParams.get('industry');
    const isActive = searchParams.get('isActive');

    const where: Prisma.ClientWhereInput = {};

    // Multi-tenant Isolation: External users can only view their assigned clients
    if (!isInternalUser(session.user)) {
      const userClientIds = session.user.clientIds || [];
      where.id = { in: userClientIds };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (industry && industry !== 'all') {
      where.industry = industry;
    }

    if (isActive !== null && isActive !== undefined && isActive !== 'all') {
      where.isActive = isActive === 'true';
    }

    const [clients, totalCount] = await Promise.all([
      prisma.client.findMany({
        skip,
        take,
        where,
        orderBy: orderBy as Prisma.ClientOrderByWithRelationInput,
        include: {
          _count: {
            select: {
              srs: true,
              users: true,
            },
          },
        },
      }),
      prisma.client.count({ where }),
    ]);

    return NextResponse.json(createResponse(clients, totalCount));
  },
  { preset: 'standard' }
);

// POST /api/clients - 새 고객사 생성 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    ensureCanCreateClient(session.user);

    // 여기서 검증하면 zod 오류가 ValidationError(400)로 매핑된다.
    // 서비스도 같은 스키마로 다시 파싱하므로(멱등) 계약은 그대로다.
    const body = await validateRequestBody(request, clientCreateSchema);

    const clientService = new ClientService();
    const client = await clientService.createClient(body);

    return NextResponse.json(client, { status: 201 });
  },
  { preset: 'strict' }
);
