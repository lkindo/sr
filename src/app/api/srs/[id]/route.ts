import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
// import { sendSRStatusChangedEmail, sendSRAssignedEmail } from "@/lib/email"; // 임시 주석

import { deleteSr } from "@/services/sr.service";
import { SRRepository } from "@/repositories/sr.repository";

import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { NotFoundError, BadRequestError, ValidationError } from "@/lib/errors";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

const srUpdateSchema = z.object({
  title: z.string().min(5, "제목은 최소 5자 이상이어야 합니다.").optional(),
  description: z
    .string()
    .min(10, "설명은 최소 10자 이상이어야 합니다.")
    .optional(),
  serviceCategoryId: z.string().optional().nullable(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  status: z
    .enum([
      "REQUESTED",
      "INTAKE",
      "IN_PROGRESS",
      "ON_HOLD",
      "COMPLETED",
      "CONFIRMED",
      "REJECTED",
    ])
    .optional(),
  assignedToId: z.string().optional().nullable(),
  expectedCompletionDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  actualCompletionDate: z.string().optional().nullable(),
  resolutionDescription: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
  satisfactionRating: z.number().min(1).max(5).optional().nullable(),
  additionalFeedback: z.string().optional().nullable(),
  // 접수 처리 관련 필드 추가
  actualPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  estimatedHours: z.number().positive("예상 작업 시간은 0보다 커야 합니다").optional(),
  estimatedCompletionDate: z.string().optional(),
  intakeNotes: z.string().optional(),
  assigneeId: z.string().min(1, "담당자를 선택해주세요").optional(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// GET /api/srs/[id] - SR 상세 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;

  const srRepository = new SRRepository();
  const sr = await srRepository.findById(id);

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
    comments: (sr as any).comments ? (sr as any).comments.map((comment: any) => ({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    })) : [],
    activities: (sr as any).activities ? (sr as any).activities.map((activity: any) => ({
      ...activity,
      createdAt: activity.createdAt.toISOString(),
    })) : [],
  };

  return NextResponse.json(serializableSr);
}, { preset: 'standard' }); // 1분당 100회

// PATCH /api/srs/[id] - SR 수정 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(async (
  request: NextRequest,
  { session, params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;
  const body = await request.json();

  let validated;
  try {
    validated = srUpdateSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.issues[0].message);
    }
    throw error;
  }

  // SR 존재 확인
  const existingSR = await prisma.sR.findUnique({
    where: { id },
  });

  if (!existingSR) {
    throw new NotFoundError("SR을 찾을 수 없습니다.");
  }

  // SR 업데이트 - undefined 값 제거
  const updateData: any = { ...validated };
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  const updatedSR = await prisma.sR.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updatedSR);
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)

// DELETE /api/srs/[id] - SR 삭제 (Rate Limit: 엄격)
export const DELETE = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;

  try {
    const result = await deleteSr(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "SR을 찾을 수 없습니다.") {
        throw new NotFoundError(error.message);
      }
      if (error.message === "진행 중이거나 완료된 SR은 삭제할 수 없습니다.") {
        throw new BadRequestError(error.message);
      }
    }
    throw error;
  }
}, { preset: 'strict' }); // 1분당 5회 (삭제는 민감한 작업)
