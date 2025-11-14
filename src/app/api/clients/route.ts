import { NextRequest, NextResponse } from "next/server";
import { ClientService } from "@/services/client.service";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/clients - 모든 고객사 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (request: NextRequest) => {
  const clientService = new ClientService();
  const clients = await clientService.getAllClients();

  return NextResponse.json(clients);
}, { preset: 'standard' });

// POST /api/clients - 새 고객사 생성 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(async (request: NextRequest) => {
  const body = await request.json();

  const clientService = new ClientService();
  const client = await clientService.createClient(body);

  return NextResponse.json(client, { status: 201 });
}, { preset: 'strict' });
