import { NextRequest, NextResponse } from "next/server";
import { ClientService } from "@/services/client.service";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { usePagination } from "@/lib/pagination";
import prisma from "@/lib/prisma";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/clients - 모든 고객사 조회 (Rate Limit: 표준)
// 페이지네이션 지원: ?page=1&pageSize=20&sortBy=name&sortOrder=asc
// GET /api/clients - 모든 고객사 조회 (Rate Limit: 표준)
// 페이지네이션 지원: ?page=1&pageSize=20&sortBy=name&sortOrder=asc
export const GET = withAuthAndRateLimit(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const { skip, take, orderBy, createResponse } = usePagination(request);

  const search = searchParams.get("search");
  const industry = searchParams.get("industry");
  const isActive = searchParams.get("isActive");

  const where: any = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }

  if (industry && industry !== "all") {
    where.industry = industry;
  }

  if (isActive !== null && isActive !== undefined && isActive !== "all") {
    where.isActive = isActive === "true";
  }

  const [clients, totalCount] = await Promise.all([
    prisma.client.findMany({
      skip,
      take,
      where,
      orderBy: orderBy as any,
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
}, { preset: 'standard' });

// POST /api/clients - 새 고객사 생성 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(async (request: NextRequest) => {
  const body = await request.json();

  const clientService = new ClientService();
  const client = await clientService.createClient(body);

  return NextResponse.json(client, { status: 201 });
}, { preset: 'strict' });
