import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SRService } from "@/services/sr.service";
import { srUpdateSchema } from "@/lib/schemas";
import { withAuthAndRateLimit, AuthenticatedContext } from "@/lib/auth-wrapper";
import { NotFoundError } from "@/lib/errors";
import { validateRequestBody, RouteContext } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";

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
  const sr = await srService.getSRDetailsById(id);

  if (!sr) {
    throw new NotFoundError("SR을 찾을 수 없습니다.");
  }

  // 날짜 객체를 문자열로 변환 (JSON 직렬화를 위해)
  const serializableSr = {
    ...sr,
    createdAt: sr.createdAt.toISOString(),
    updatedAt: sr.updatedAt.toISOString(),
    dueDate: sr.dueDate ? sr.dueDate.toISOString() : null,
    requestedCompletionDate: sr.requestedCompletionDate ? sr.requestedCompletionDate.toISOString() : null,
    estimatedCompletionDate: sr.estimatedCompletionDate ? sr.estimatedCompletionDate.toISOString() : null,
    actualCompletionDate: sr.actualCompletionDate ? sr.actualCompletionDate.toISOString() : null,
    // 관련 객체들의 날짜 필드도 변환
    comments: sr.comments?.map((comment) => ({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    })) || [],
    activities: sr.activities?.map((activity) => ({
      ...activity,
      createdAt: activity.createdAt.toISOString(),
    })) || [],
  };

  return NextResponse.json(serializableSr);
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
  
  return NextResponse.json(result);
}, { preset: 'strict' }); // 1분당 5회 (삭제는 민감한 작업)
