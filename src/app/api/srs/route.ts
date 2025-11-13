import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
// import { sendSRCreatedEmail } from "@/lib/email"; // 임시 주석

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const srSchema = z.object({
  title: z.string().min(5, "제목은 최소 5자 이상이어야 합니다."),
  description: z.string().min(10, "설명은 최소 10자 이상이어야 합니다."),
  clientId: z.string().min(1, "고객사를 선택해주세요."),
  serviceCategoryId: z.string().min(1, "서비스 카테고리를 선택해주세요."),
  requestedPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  requestedCompletionDate: z.string().optional(),
});

import { getAllSrs, createSr } from "@/services/sr.service";

// GET /api/srs - SR 목록 조회
export async function GET(request: NextRequest) {
  console.log("🔍 [GET /api/srs] 요청 시작");
  try {
    // TODO: auth() 함수가 Edge Runtime 문제로 500 에러 발생
    // 임시로 주석 처리하고 테스트
    /*
    console.log("🔍 [GET /api/srs] auth() 호출 중...");
    const session = await auth();
    console.log("🔍 [GET /api/srs] 세션:", session ? `✅ ${session.user?.email}` : "❌ 없음");
    if (!session) {
      console.log("🔍 [GET /api/srs] 401 반환");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    */

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const clientId = searchParams.get("clientId");
    const priority = searchParams.get("priority");

    const srs = await getAllSrs({ status: status || undefined, clientId: clientId || undefined, priority: priority || undefined });

    console.log("🔍 [GET /api/srs] 쿼리 성공! SR 개수:", srs.length);

    // Date 객체를 문자열로 변환 (직렬화 문제 해결)
    const serializableSrs = srs.map(sr => ({
      ...sr,
      createdAt: sr.createdAt.toISOString(),
      updatedAt: sr.updatedAt.toISOString(),
      dueDate: sr.dueDate ? sr.dueDate.toISOString() : null,
      requestedCompletionDate: sr.requestedCompletionDate ? sr.requestedCompletionDate.toISOString() : null,
    }));

    console.log("🔍 [GET /api/srs] 200 응답 반환");
    return NextResponse.json(serializableSrs);
  } catch (error) {
    console.error("Error fetching SRs:", error);
    console.error("Error details:", error instanceof Error ? error.message : error);
    console.error("Error stack:", error instanceof Error ? error.stack : "");
    return NextResponse.json(
      { 
        error: "SR 목록을 불러오는 중 오류가 발생했습니다.",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}

// POST /api/srs - 새 SR 생성
export async function POST(request: NextRequest) {
  console.log("🔍 [POST /api/srs] 요청 시작");
  try {
    // TODO: auth() 함수가 Edge Runtime 문제로 500 에러 발생
    // 임시로 admin 사용자 사용
    /*
    console.log("🔍 [POST /api/srs] auth() 호출 중...");
    const session = await auth();
    console.log("🔍 [POST /api/srs] 세션:", session ? `✅ ${session.user?.email}` : "❌ 없음");
    if (!session) {
      console.log("🔍 [POST /api/srs] 401 반환");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    */
    
    // 임시: admin 사용자 조회
    const adminUser = await prisma.user.findFirst({
      where: { email: "admin@example.com" }
    });
    
    if (!adminUser) {
      return NextResponse.json(
        { error: "Admin user not found. Please run seed script." },
        { status: 500 }
      );
    }
    
    const session = { user: { id: adminUser.id, email: adminUser.email } } as any;

    const body = await request.json();
    console.log("🔍 [POST /api/srs] 요청 바디:", body);
    
    const sr = await createSr(body, session.user);
    console.log("🔍 [POST /api/srs] SR 생성 성공! ID:", sr.id);

    // Send email notification (non-blocking)
    // TODO: 임시로 주석 처리
    /*
    if (process.env.RESEND_API_KEY && sr.requester) {
      sendSRCreatedEmail({
        to: sr.requester.email,
        srId: sr.id,
        srNumber: sr.srNumber,
        title: sr.title,
        description: sr.description,
        priority: sr.priority,
        clientName: sr.client?.name || "",
        requesterName: sr.requester.name,
        requesterEmail: sr.requester.email,
      }).catch((error) => {
        console.error("Failed to send SR created email:", error);
        // Don't fail the request if email sending fails
      });
    }
    */

    const serializableSr = {
      ...sr,
      createdAt: sr.createdAt.toISOString(),
      updatedAt: sr.updatedAt.toISOString(),
      dueDate: sr.dueDate ? sr.dueDate.toISOString() : null,
      requestedCompletionDate: sr.requestedCompletionDate ? sr.requestedCompletionDate.toISOString() : null,
    };

    return NextResponse.json(serializableSr, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues?.[0];
      return NextResponse.json(
        { error: firstError?.message || "유효성 검사 실패" },
        { status: 400 }
      );
    }

    console.error("Error creating SR:", error);
    return NextResponse.json(
      { error: "SR 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

