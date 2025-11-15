import { NextRequest, NextResponse } from "next/server";
import { SRService, getAllSrs, createSr } from "@/services/sr.service";
import { sendSRCreatedEmail } from "@/lib/email";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import prisma from "@/lib/prisma";

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

  const srs = await getAllSrs(filters);

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
export const POST = withAuthAndRateLimit(async (request: NextRequest, { session }) => {
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

  return NextResponse.json(serializableSr, { status: 201 });
}, { preset: 'standard' }); // 1분당 100회

