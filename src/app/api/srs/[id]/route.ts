import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
// import { sendSRStatusChangedEmail, sendSRAssignedEmail } from "@/lib/email"; // 임시 주석

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

import { getSrById, deleteSr } from "@/services/sr.service";

// GET /api/srs/[id] - SR 상세 조회
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // TODO: auth() 함수 임시 주석 처리
    /*
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    */

    const sr = await getSrById(id);

    if (!sr) {
      return NextResponse.json(
        { error: "SR을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const serializableSr = {
      ...sr,
      createdAt: sr.createdAt.toISOString(),
      updatedAt: sr.updatedAt.toISOString(),
      dueDate: sr.dueDate ? sr.dueDate.toISOString() : null,
      requestedCompletionDate: sr.requestedCompletionDate ? sr.requestedCompletionDate.toISOString() : null,
      estimatedCompletionDate: sr.estimatedCompletionDate ? sr.estimatedCompletionDate.toISOString() : null,
      actualCompletionDate: sr.actualCompletionDate ? sr.actualCompletionDate.toISOString() : null,
      // 관련 객체들의 날짜 필드도 변환해야 할 수 있습니다.
      // 예: sr.comments, sr.activities 등
      comments: sr.comments.map(comment => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
      })),
      activities: sr.activities.map(activity => ({
        ...activity,
        createdAt: activity.createdAt.toISOString(),
      })),
    };

    return NextResponse.json(serializableSr);
  } catch (error) {
    console.error("Error fetching SR:", error);
    return NextResponse.json(
      { error: "SR 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/srs/[id] - SR 삭제
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // TODO: auth() 함수 임시 주석 처리
    /*
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    */

    const result = await deleteSr(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
        if (error.message === "SR을 찾을 수 없습니다.") {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        if (error.message === "진행 중이거나 완료된 SR은 삭제할 수 없습니다.") {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
    }
    console.error("Error deleting SR:", error);
    return NextResponse.json(
      { error: "SR 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
