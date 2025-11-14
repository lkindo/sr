import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { NotFoundError, BadRequestError, ValidationError } from "@/lib/errors";

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 접수 처리 요청 스키마
const intakeSchema = z.object({
  actualPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  estimatedHours: z.number().positive("예상 작업 시간은 0보다 커야 합니다"),
  estimatedCompletionDate: z.string(),
  intakeNotes: z.string().optional(),
  assigneeId: z.string().min(1, "담당자를 선택해주세요"),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// POST /api/srs/{id}/intake - SR 접수 처리 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(async (
  request: NextRequest,
  { session, params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;

  // 1. 요청 바디 검증
  const body = await request.json();
  let validated;
  try {
    validated = intakeSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.issues[0].message);
    }
    throw error;
  }

  // 2. SR 조회 및 상태 확인
  const sr = await prisma.sR.findUnique({
    where: { id },
    include: {
      serviceCategory: true,
      client: true,
      requester: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      }
    }
  });

  if (!sr) {
    throw new NotFoundError("SR을 찾을 수 없습니다");
  }

  if (sr.status !== "REQUESTED") {
    throw new BadRequestError("이미 접수된 SR입니다");
  }

  // 3. 담당자 조회
  const assignee = await prisma.user.findUnique({
    where: { id: validated.assigneeId },
    select: {
      id: true,
      name: true,
      email: true,
    }
  });

  if (!assignee) {
    throw new NotFoundError("담당자를 찾을 수 없습니다");
  }

  // 4. SLA 기반 마감일 자동 계산
  const slaHours = sr.serviceCategory.slaHours;
  const priorityMultiplier: Record<string, number> = {
    CRITICAL: 0.5,
    HIGH: 0.75,
    MEDIUM: 1.0,
    LOW: 1.5
  };

  const adjustedHours = slaHours * priorityMultiplier[validated.actualPriority];
  const dueDate = new Date();
  dueDate.setHours(dueDate.getHours() + adjustedHours);

  // 5. SR 업데이트 (REQUESTED → IN_PROGRESS)
  const updatedSR = await prisma.sR.update({
    where: { id },
    data: {
      status: "IN_PROGRESS",
      intakeAt: new Date(),
      intakeBy: {
        connect: { id: session.user.id }
      },
      actualPriority: validated.actualPriority,
      estimatedHours: validated.estimatedHours,
      estimatedCompletionDate: new Date(validated.estimatedCompletionDate),
      dueDate: dueDate,
      intakeNotes: validated.intakeNotes || null,
      assignee: {
        connect: { id: validated.assigneeId }
      },
    },
    include: {
      client: {
        select: {
          id: true,
          code: true,
          name: true,
        }
      },
      serviceCategory: true,
      requester: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      },
      intakeBy: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      }
    }
  });

  // 6. Activity 로그 생성
  await prisma.sRActivity.create({
    data: {
      srId: id,
      userId: session.user.id,
      type: "STATUS_CHANGED",
      description: `SR이 접수되었습니다 (담당자: ${assignee.name})`,
      metadata: {
        previousStatus: "REQUESTED",
        currentStatus: "IN_PROGRESS",
        actualPriority: validated.actualPriority,
        estimatedHours: validated.estimatedHours,
        estimatedCompletionDate: validated.estimatedCompletionDate,
        assigneeId: validated.assigneeId,
        assigneeName: assignee.name,
      }
    }
  });

  // 7. 상태 이력 생성
  await prisma.sRStatusHistory.create({
    data: {
      srId: id,
      previousStatus: "REQUESTED",
      currentStatus: "IN_PROGRESS",
      changedBy: session.user.id,
      changeReason: "접수 완료"
    }
  });

  // 8. 담당자 배정 Activity 로그
  await prisma.sRActivity.create({
    data: {
      srId: id,
      userId: session.user.id,
      type: "ASSIGNED",
      description: `담당자가 배정되었습니다: ${assignee.name}`,
      metadata: {
        assigneeId: assignee.id,
        assigneeName: assignee.name,
      }
    }
  });

  return NextResponse.json({
    success: true,
    sr: updatedSR,
    message: "SR이 성공적으로 접수되었습니다"
  }, { status: 200 });
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)

// GET /api/srs/{id}/intake - 접수 정보 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;

  const sr = await prisma.sR.findUnique({
    where: { id },
    select: {
      id: true,
      srNumber: true,
      title: true,
      description: true,
      status: true,
      requestedPriority: true,
      requestedCompletionDate: true,
      actualPriority: true,
      intakeNotes: true,
      estimatedHours: true,
      estimatedCompletionDate: true,
      dueDate: true,
      intakeAt: true,
      client: {
        select: {
          id: true,
          code: true,
          name: true,
        }
      },
      requester: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      },
      intakeBy: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      },
      serviceCategory: {
        select: {
          id: true,
          categoryName: true,
          slaHours: true,
          handlerId: true,
          handler: {
            select: {
              id: true,
              name: true,
            }
          }
        }
      },
      attachments: {
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          fileType: true,
          fileUrl: true,
          createdAt: true,
        }
      }
    }
  });

  if (!sr) {
    throw new NotFoundError("SR을 찾을 수 없습니다");
  }

  return NextResponse.json(sr);
}, { preset: 'standard' }); // 1분당 100회
