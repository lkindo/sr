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

    const sr = await prisma.sR.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        serviceCategory: {
          select: {
            id: true,
            categoryName: true,
          },
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        attachments: {
          orderBy: {
            createdAt: "desc",
          },
        },
        activities: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        },
        statusHistory: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            changedAt: "desc",
          },
        },
      },
    });

    if (!sr) {
      return NextResponse.json(
        { error: "SR을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Transform serviceCategory.categoryName to category.name for frontend compatibility
    const transformedSr = {
      ...sr,
      category: sr.serviceCategory ? {
        id: sr.serviceCategory.id,
        name: sr.serviceCategory.categoryName,
      } : null,
      assignedTo: sr.assignee,
      _count: {
        comments: sr.comments?.length || 0,
        attachments: sr.attachments?.length || 0,
      }
    };

    return NextResponse.json(transformedSr);
  } catch (error) {
    console.error("Error fetching SR:", error);
    return NextResponse.json(
      { error: "SR 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH /api/srs/[id] - SR 수정
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // TODO: auth() 함수 임시 주석 처리
    /*
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    */
    
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
    
    const session = { user: { id: adminUser.id } } as any;

    const body = await request.json();
    const validated = srUpdateSchema.parse(body);

    // Get existing SR
    const existingSr = await prisma.sR.findUnique({
      where: { id },
    });

    if (!existingSr) {
      return NextResponse.json(
        { error: "SR을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const updateData: any = {};

    // 접수 처리 관련 필드 먼저 처리
    if (validated.actualPriority !== undefined) {
      updateData.actualPriority = validated.actualPriority;

      // 우선순위 변경 시 마감일 재계산
      if (validated.actualPriority !== existingSr.actualPriority) {
        const serviceCategory = await prisma.serviceCategory.findUnique({
          where: { id: existingSr.serviceCategoryId || "" }
        });

        if (serviceCategory) {
          const priorityMultiplier: Record<string, number> = {
            CRITICAL: 0.5,
            HIGH: 0.75,
            MEDIUM: 1.0,
            LOW: 1.5
          };

          const adjustedHours = serviceCategory.slaHours * priorityMultiplier[validated.actualPriority];
          const dueDate = new Date(existingSr.intakeAt || new Date());
          dueDate.setHours(dueDate.getHours() + adjustedHours);
          updateData.dueDate = dueDate;
        }
      }
    }

    if (validated.estimatedHours !== undefined) {
      updateData.estimatedHours = validated.estimatedHours;
    }

    if (validated.estimatedCompletionDate !== undefined) {
      updateData.estimatedCompletionDate = new Date(validated.estimatedCompletionDate);
    }

    if (validated.intakeNotes !== undefined) {
      updateData.intakeNotes = validated.intakeNotes;
    }

    if (validated.assigneeId !== undefined) {
      updateData.assigneeId = validated.assigneeId;
    }

    // Handle field updates
    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.description !== undefined)
      updateData.description = validated.description;
    if (validated.serviceCategoryId !== undefined) {
      if (validated.serviceCategoryId === null) {
        updateData.serviceCategory = { disconnect: true };
      } else {
        updateData.serviceCategory = { connect: { id: validated.serviceCategoryId } };
      }
    }
    if (validated.priority !== undefined)
      updateData.priority = validated.priority;
    if (validated.assignedToId !== undefined) {
      if (validated.assignedToId === null) {
        updateData.assignee = { disconnect: true };
      } else {
        updateData.assignee = { connect: { id: validated.assignedToId } };
      }
    }
    if (validated.resolutionDescription !== undefined)
      updateData.resolutionDescription = validated.resolutionDescription;
    if (validated.rejectionReason !== undefined)
      updateData.rejectionReason = validated.rejectionReason;
    if (validated.satisfactionRating !== undefined)
      updateData.satisfactionRating = validated.satisfactionRating;
    if (validated.additionalFeedback !== undefined)
      updateData.additionalFeedback = validated.additionalFeedback;

    // Handle date fields
    if (validated.expectedCompletionDate !== undefined) {
      updateData.expectedCompletionDate = validated.expectedCompletionDate
        ? new Date(validated.expectedCompletionDate)
        : null;
    }

    if (validated.dueDate !== undefined) {
      updateData.dueDate = validated.dueDate
        ? new Date(validated.dueDate)
        : null;
    }

    if (validated.actualCompletionDate !== undefined) {
      updateData.actualCompletionDate = validated.actualCompletionDate
        ? new Date(validated.actualCompletionDate)
        : null;
    }

    // Handle status change
    if (validated.status && validated.status !== existingSr.status) {
      updateData.status = validated.status;

      // Create status history
      await prisma.sRStatusHistory.create({
        data: {
          srId: id,
          previousStatus: existingSr.status,
          currentStatus: validated.status,
          changedBy: session.user.id,
          changeReason: body.changeReason || `상태 변경: ${existingSr.status} → ${validated.status}`,
        },
      });

      // Create activity log
      await prisma.sRActivity.create({
        data: {
          srId: id,
          userId: session.user.id,
          type: "STATUS_CHANGED",
          description: `상태가 ${existingSr.status}에서 ${validated.status}로 변경되었습니다.`,
        },
      });

      // Set completion date if status is COMPLETED
      if (validated.status === "COMPLETED" && !updateData.actualCompletionDate) {
        updateData.actualCompletionDate = new Date();
      }
    }

    // Handle assignment change (assignedToId 또는 assigneeId 둘 다 지원)
    const newAssigneeId = validated.assigneeId || validated.assignedToId;
    if (
      newAssigneeId !== undefined &&
      newAssigneeId !== existingSr.assigneeId
    ) {
      await prisma.sRActivity.create({
        data: {
          srId: id,
          userId: session.user.id,
          type: "ASSIGNED",
          description: newAssigneeId
            ? "담당자가 할당되었습니다."
            : "담당자 할당이 해제되었습니다.",
        },
      });
    }

    // 접수 정보 수정 Activity 로그 생성
    const intakeChanges: string[] = [];
    if (validated.actualPriority && validated.actualPriority !== existingSr.actualPriority) {
      intakeChanges.push(`우선순위 변경: ${existingSr.actualPriority} → ${validated.actualPriority}`);
    }
    if (validated.estimatedHours !== undefined && validated.estimatedHours !== existingSr.estimatedHours) {
      intakeChanges.push(`예상 작업 시간 변경: ${existingSr.estimatedHours}시간 → ${validated.estimatedHours}시간`);
    }
    if (validated.estimatedCompletionDate &&
        new Date(validated.estimatedCompletionDate).getTime() !== existingSr.estimatedCompletionDate?.getTime()) {
      intakeChanges.push(`예상 완료일 변경`);
    }

    if (intakeChanges.length > 0) {
      await prisma.sRActivity.create({
        data: {
          srId: id,
          userId: session.user.id,
          type: "UPDATED",
          description: `SR 접수 정보가 수정되었습니다:\n${intakeChanges.join('\n')}`,
          metadata: {
            actualPriority: validated.actualPriority,
            estimatedHours: validated.estimatedHours,
            estimatedCompletionDate: validated.estimatedCompletionDate,
          }
        },
      });
    }

    const sr = await prisma.sR.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        serviceCategory: true,
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Send email notifications (non-blocking)
    // TODO: 임시로 주석 처리
    /*
    if (process.env.RESEND_API_KEY && sr.requester) {
      // Status changed email
      if (validated.status && validated.status !== existingSr.status) {
        sendSRStatusChangedEmail({
          to: sr.requester.email,
          srId: sr.id,
          srNumber: sr.srNumber,
          title: sr.title,
          fromStatus: existingSr.status,
          toStatus: validated.status,
          changeReason: body.changeReason,
          changedByName: session.user.name || "관리자",
          clientName: sr.client.name,
        }).catch((error) => {
          console.error("Failed to send SR status changed email:", error);
        });
      }

      // Assignment changed email
      if (
        validated.assignedToId &&
        validated.assignedToId !== existingSr.assigneeId &&
        sr.assignee
      ) {
        sendSRAssignedEmail({
          to: sr.assignee.email,
          srId: sr.id,
          srNumber: sr.srNumber,
          title: sr.title,
          description: sr.description,
          priority: sr.priority,
          clientName: sr.client?.name || "",
          assignedToName: sr.assignee.name,
          assignedByName: session.user.name || "관리자",
        }).catch((error) => {
          console.error("Failed to send SR assigned email:", error);
        });
      }
    }
    */

    return NextResponse.json(sr);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues?.[0];
      return NextResponse.json(
        { error: firstError?.message || "유효성 검사 실패" },
        { status: 400 }
      );
    }

    console.error("Error updating SR:", error);
    return NextResponse.json(
      { error: "SR 수정 중 오류가 발생했습니다." },
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

    const existingSr = await prisma.sR.findUnique({
      where: { id },
    });

    if (!existingSr) {
      return NextResponse.json(
        { error: "SR을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Only allow deletion if status is REQUESTED or REJECTED
    if (!["REQUESTED", "REJECTED"].includes(existingSr.status)) {
      return NextResponse.json(
        { error: "진행 중이거나 완료된 SR은 삭제할 수 없습니다." },
        { status: 400 }
      );
    }

    await prisma.sR.delete({
      where: { id },
    });

    return NextResponse.json({ message: "SR이 삭제되었습니다." });
  } catch (error) {
    console.error("Error deleting SR:", error);
    return NextResponse.json(
      { error: "SR 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
