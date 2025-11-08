import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { sendSRStatusChangedEmail, sendSRAssignedEmail } from "@/lib/email";

const srUpdateSchema = z.object({
  title: z.string().min(5, "제목은 최소 5자 이상이어야 합니다.").optional(),
  description: z.string().min(10, "설명은 최소 10자 이상이어야 합니다.").optional(),
  serviceCategoryId: z.string().optional().nullable(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  status: z.enum([
    "REQUESTED",
    "INTAKE",
    "IN_PROGRESS",
    "ON_HOLD",
    "COMPLETED",
    "CONFIRMED",
    "REJECTED",
  ]).optional(),
  assignedToId: z.string().optional().nullable(),
  requestedCompletionDate: z.string().optional().nullable(),
  actualCompletionDate: z.string().optional().nullable(),
  estimatedHours: z.number().optional().nullable(),
  actualHours: z.number().optional().nullable(),
  resolutionDescription: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
  satisfactionRating: z.number().min(1).max(5).optional().nullable(),
  additionalFeedback: z.string().optional().nullable(),
});

// GET /api/srs/[id] - SR 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sr = await prisma.sR.findUnique({
      where: { id: params.id },
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

    return NextResponse.json(sr);
  } catch (error) {
    console.error("Error fetching SR:", error);
    return NextResponse.json(
      { error: "SR 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH /api/srs/[id] - SR 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = srUpdateSchema.parse(body);

    // Get existing SR
    const existingSr = await prisma.sR.findUnique({
      where: { id: params.id },
    });

    if (!existingSr) {
      return NextResponse.json(
        { error: "SR을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const updateData: any = {};

    // Handle field updates
    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.description !== undefined)
      updateData.description = validated.description;
    if (validated.serviceCategoryId !== undefined)
      updateData.serviceCategoryId = validated.serviceCategoryId;
    if (validated.priority !== undefined)
      updateData.priority = validated.priority;
    if (validated.assignedToId !== undefined)
      updateData.assigneeId = validated.assignedToId;
    if (validated.estimatedHours !== undefined)
      updateData.estimatedHours = validated.estimatedHours;
    if (validated.actualHours !== undefined)
      updateData.actualHours = validated.actualHours;
    if (validated.resolutionDescription !== undefined)
      updateData.resolutionDescription = validated.resolutionDescription;
    if (validated.rejectionReason !== undefined)
      updateData.rejectionReason = validated.rejectionReason;
    if (validated.satisfactionRating !== undefined)
      updateData.satisfactionRating = validated.satisfactionRating;
    if (validated.additionalFeedback !== undefined)
      updateData.additionalFeedback = validated.additionalFeedback;

    // Handle date fields
    if (validated.requestedCompletionDate !== undefined) {
      updateData.requestedCompletionDate = validated.requestedCompletionDate
        ? new Date(validated.requestedCompletionDate)
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
          srId: params.id,
          previousStatus: existingSr.status,
          currentStatus: validated.status,
          changedBy: session.user.id,
          changeReason: body.changeReason || `상태 변경: ${existingSr.status} → ${validated.status}`,
        },
      });

      // Create activity log
      await prisma.sRActivity.create({
        data: {
          srId: params.id,
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

    // Handle assignment change
    if (
      validated.assignedToId !== undefined &&
      validated.assignedToId !== existingSr.assigneeId
    ) {
      await prisma.sRActivity.create({
        data: {
          srId: params.id,
          userId: session.user.id,
          type: "ASSIGNED",
          description: validated.assignedToId
            ? "담당자가 할당되었습니다."
            : "담당자 할당이 해제되었습니다.",
        },
      });
    }

    const sr = await prisma.sR.update({
      where: { id: params.id },
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
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingSr = await prisma.sR.findUnique({
      where: { id: params.id },
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
      where: { id: params.id },
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
