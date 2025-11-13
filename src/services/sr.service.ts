// src/services/sr.service.ts
import prisma from "@/lib/prisma";
import { SR, SRActivityType, SRStatus, User } from "@prisma/client";
import { z } from "zod";

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
  changeReason: z.string().optional(),
});

type SrUpdateData = z.infer<typeof srUpdateSchema>;

export async function updateSr(
  id: string,
  data: SrUpdateData,
  sessionUser: User
) {
  const validated = srUpdateSchema.parse(data);

  const existingSr = await prisma.sR.findUnique({
    where: { id },
  });

  if (!existingSr) {
    throw new Error("SR을 찾을 수 없습니다.");
  }

  const updateData: any = {};

  // This is where the complex logic from the PATCH handler will go.
  // For now, we'll just copy over the data mapping.

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
            changedBy: sessionUser.id,
            changeReason: validated.changeReason || `상태 변경: ${existingSr.status} → ${validated.status}`,
          },
        });
  
        // Create activity log
        await prisma.sRActivity.create({
          data: {
            srId: id,
            userId: sessionUser.id,
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
            userId: sessionUser.id,
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
            userId: sessionUser.id,
            type: "COMMENTED",
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

  // We will handle email notifications separately
  return sr;
}

export async function getSrById(id: string) {
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
    return null;
  }

  // Transform data for frontend compatibility
  const transformedSr = {
    ...sr,
    category: sr.serviceCategory
      ? {
          id: sr.serviceCategory.id,
          name: sr.serviceCategory.categoryName,
        }
      : null,
    assignedTo: sr.assignee,
    _count: {
      comments: sr.comments?.length || 0,
      attachments: sr.attachments?.length || 0,
    },
  };

  return transformedSr;
}

export async function deleteSr(id: string) {
  const existingSr = await prisma.sR.findUnique({
    where: { id },
  });

  if (!existingSr) {
    throw new Error("SR을 찾을 수 없습니다.");
  }

  // Only allow deletion if status is REQUESTED or REJECTED
  if (!["REQUESTED", "REJECTED"].includes(existingSr.status)) {
    throw new Error("진행 중이거나 완료된 SR은 삭제할 수 없습니다.");
  }

  await prisma.sR.delete({
    where: { id },
  });

  return { message: "SR이 삭제되었습니다." };
}

const srSchema = z.object({
  title: z.string().min(5, "제목은 최소 5자 이상이어야 합니다."),
  description: z.string().min(10, "설명은 최소 10자 이상이어야 합니다."),
  clientId: z.string().min(1, "고객사를 선택해주세요."),
  serviceCategoryId: z.string().min(1, "서비스 카테고리를 선택해주세요."),
  requestedPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  requestedCompletionDate: z.string().optional(),
});

type SrCreateData = z.infer<typeof srSchema>;

export async function getAllSrs(filters: { status?: string; clientId?: string; priority?: string }) {
  const where: any = {};

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.clientId) {
    where.clientId = filters.clientId;
  }

  if (filters.priority) {
    where.priority = filters.priority;
  }

  const srs = await prisma.sR.findMany({
    where,
    include: {
      client: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
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
      _count: {
        select: {
          comments: true,
          attachments: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Map assignee to assignedTo for frontend compatibility
  const mappedSrs = srs.map((sr) => ({
    ...sr,
    assignedTo: sr.assignee,
  }));

  return mappedSrs;
}

export async function createSr(data: SrCreateData, sessionUser: { id: string; email: string }) {
  const validated = srSchema.parse(data);

  // Generate SR number (format: SR-YYYYMMDD-XXXX)
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  // Get count of SRs created today
  const todayStart = new Date(today.setHours(0, 0, 0, 0));
  const todayEnd = new Date(today.setHours(23, 59, 59, 999));

  const todayCount = await prisma.sR.count({
    where: {
      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  });

  const srNumber = `SR-${dateStr}-${String(todayCount + 1).padStart(4, "0")}`;

  const sr = await prisma.sR.create({
    data: {
      srNumber,
      title: validated.title,
      description: validated.description,
      clientId: validated.clientId,
      serviceCategoryId: validated.serviceCategoryId,
      requesterId: sessionUser.id,
      requestedPriority: validated.requestedPriority,
      priority: validated.requestedPriority, // 초기 우선순위는 요청 우선순위와 동일
      requestedCompletionDate: validated.requestedCompletionDate
        ? new Date(validated.requestedCompletionDate)
        : undefined,
      status: "REQUESTED",
    },
    include: {
      client: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      serviceCategory: true,
      requester: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignee: true,
    },
  });

  // Create activity log
  await prisma.sRActivity.create({
    data: {
      srId: sr.id,
      userId: sessionUser.id,
      type: "CREATED",
      description: "SR이 생성되었습니다.",
    },
  });

  // Create status history
  await prisma.sRStatusHistory.create({
    data: {
      srId: sr.id,
      previousStatus: null,
      currentStatus: "REQUESTED",
      changedBy: sessionUser.id,
      changeReason: "SR 생성",
    },
  });

  // Email notification will be handled separately
  return sr;
}
