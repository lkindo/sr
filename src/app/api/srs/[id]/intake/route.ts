import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

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

// POST /api/srs/{id}/intake - SR 접수 처리
export async function POST(request: NextRequest, context: RouteContext) {
  console.log("🔍 [POST /api/srs/:id/intake] 요청 시작");

  try {
    const { id } = await context.params;

    // 임시: admin 사용자 조회
    const adminUser = await prisma.user.findFirst({
      where: { email: "admin@example.com" }
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 500 }
      );
    }

    const session = { user: { id: adminUser.id, email: adminUser.email } } as any;

    // 1. 요청 바디 검증
    const body = await request.json();
    console.log("🔍 요청 데이터:", body);

    const validated = intakeSchema.parse(body);

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
      return NextResponse.json(
        { error: "SR을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    if (sr.status !== "REQUESTED") {
      return NextResponse.json(
        { error: "이미 접수된 SR입니다" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "담당자를 찾을 수 없습니다" },
        { status: 404 }
      );
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

    console.log("📅 SLA 계산:", {
      slaHours,
      actualPriority: validated.actualPriority,
      multiplier: priorityMultiplier[validated.actualPriority],
      adjustedHours,
      dueDate
    });

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

    console.log("✅ SR 접수 완료:", updatedSR.srNumber);

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

    // TODO: 알림 발송 (담당자에게)
    // await sendNotification({
    //   to: assignee.email,
    //   type: 'SR_ASSIGNED',
    //   srNumber: sr.srNumber,
    //   title: sr.title
    // });

    console.log("✅ [POST /api/srs/:id/intake] 완료");

    return NextResponse.json({
      success: true,
      sr: updatedSR,
      message: "SR이 성공적으로 접수되었습니다"
    }, { status: 200 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues?.[0];
      console.error("❌ 유효성 검사 실패:", firstError);
      return NextResponse.json(
        { error: firstError?.message || "유효성 검사 실패" },
        { status: 400 }
      );
    }

    console.error("❌ [POST /api/srs/:id/intake] 오류:", error);
    return NextResponse.json(
      {
        error: "SR 접수 중 오류가 발생했습니다",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}

// GET /api/srs/{id}/intake - 접수 정보 조회
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

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
      return NextResponse.json(
        { error: "SR을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    return NextResponse.json(sr);

  } catch (error) {
    console.error("❌ [GET /api/srs/:id/intake] 오류:", error);
    return NextResponse.json(
      { error: "SR 조회 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
