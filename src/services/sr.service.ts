import { User } from "@prisma/client";
import { z } from "zod";
import { SRRepository } from "@/repositories/sr.repository";
import { SRActivityRepository } from "@/repositories/sr-activity.repository";
import { SRCommentRepository } from "@/repositories/sr-comment.repository";
import { ClientRepository } from "@/repositories/client.repository";
import { ServiceCategoryRepository } from "@/repositories/service-category.repository";

// 입력 스키마 정의
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

const srSchema = z.object({
  title: z.string().min(5, "제목은 최소 5자 이상이어야 합니다."),
  description: z.string().min(10, "설명은 최소 10자 이상이어야 합니다."),
  clientId: z.string().min(1, "고객사를 선택해주세요."),
  serviceCategoryId: z.string().min(1, "서비스 카테고리를 선택해주세요."),
  requestedPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  requestedCompletionDate: z.string().optional(),
});

type SrUpdateData = z.infer<typeof srUpdateSchema>;
type SrCreateData = z.infer<typeof srSchema>;

export class SRService {
  private srRepository: SRRepository;
  private srActivityRepository: SRActivityRepository;
  private srCommentRepository: SRCommentRepository;
  private clientRepository: ClientRepository;
  private serviceCategoryRepository: ServiceCategoryRepository;

  constructor() {
    this.srRepository = new SRRepository();
    this.srActivityRepository = new SRActivityRepository();
    this.srCommentRepository = new SRCommentRepository();
    this.clientRepository = new ClientRepository();
    this.serviceCategoryRepository = new ServiceCategoryRepository();
  }

  async createSR(data: SrCreateData, sessionUser: { id: string; email: string }) {
    const validated = srSchema.parse(data);

    // Generate SR number (format: SR-YYYYMMDD-XXXX)
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

    // Get count of SRs created today
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const todayEnd = new Date(today.setHours(23, 59, 59, 999));

    const todayCount = await this.srRepository.findAll({
      where: {
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    const srNumber = `SR-${dateStr}-${String(todayCount.length + 1).padStart(4, "0")}`;

    const sr = await this.srRepository.create({
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
    });

    // Create activity log
    await this.srActivityRepository.create({
      srId: sr.id,
      userId: sessionUser.id,
      type: "CREATED",
      description: "SR이 생성되었습니다.",
    });

    // Create status history
    await this.srRepository.update(sr.id, {
      statusHistory: {
        create: {
          previousStatus: null,
          currentStatus: "REQUESTED",
          changedBy: sessionUser.id,
          changeReason: "SR 생성",
        },
      },
    });

    // Email notification will be handled separately
    return sr;
  }

  async updateSR(id: string, data: SrUpdateData, sessionUser: User) {
    const validated = srUpdateSchema.parse(data);

    const existingSR = await this.srRepository.findById(id);
    if (!existingSR) {
      throw new Error("SR을 찾을 수 없습니다.");
    }

    const updateData: any = {};

    // 접수 처리 관련 필드 먼저 처리
    if (validated.actualPriority !== undefined) {
      updateData.actualPriority = validated.actualPriority;

      // 우선순위 변경 시 마감일 재계산
      if (validated.actualPriority !== existingSR.actualPriority) {
        const serviceCategory = await this.serviceCategoryRepository.findById(
          existingSR.serviceCategoryId
        );

        if (serviceCategory) {
          const priorityMultiplier: Record<string, number> = {
            CRITICAL: 0.5,
            HIGH: 0.75,
            MEDIUM: 1.0,
            LOW: 1.5
          };

          const adjustedHours = serviceCategory.slaHours * priorityMultiplier[validated.actualPriority];
          const dueDate = new Date(existingSR.intakeAt || new Date());
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
      // 서비스 카테고리는 연결/해제 로직이 복잡하므로 별도 처리가 필요합니다
      if (validated.serviceCategoryId === null) {
        updateData.serviceCategoryId = null;
      } else {
        updateData.serviceCategoryId = validated.serviceCategoryId;
      }
    }
    if (validated.priority !== undefined)
      updateData.priority = validated.priority;
    if (validated.assignedToId !== undefined) {
      if (validated.assignedToId === null) {
        updateData.assigneeId = null;
      } else {
        updateData.assigneeId = validated.assignedToId;
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
    if (validated.status && validated.status !== existingSR.status) {
      updateData.status = validated.status;

      // Create status history
      await this.srRepository.update(existingSR.id, {
        statusHistory: {
          create: {
            previousStatus: existingSR.status,
            currentStatus: validated.status,
            changedBy: sessionUser.id,
            changeReason: validated.changeReason || `상태 변경: ${existingSR.status} → ${validated.status}`,
          },
        },
      });

      // Create activity log
      await this.srActivityRepository.create({
        srId: id,
        userId: sessionUser.id,
        type: "STATUS_CHANGED",
        description: `상태가 ${existingSR.status}에서 ${validated.status}로 변경되었습니다.`,
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
      newAssigneeId !== existingSR.assigneeId
    ) {
      await this.srActivityRepository.create({
        srId: id,
        userId: sessionUser.id,
        type: "ASSIGNED",
        description: newAssigneeId
          ? "담당자가 할당되었습니다."
          : "담당자 할당이 해제되었습니다.",
      });
    }

    // 접수 정보 수정 Activity 로그 생성
    const intakeChanges: string[] = [];
    if (validated.actualPriority && validated.actualPriority !== existingSR.actualPriority) {
      intakeChanges.push(`우선순위 변경: ${existingSR.actualPriority} → ${validated.actualPriority}`);
    }
    if (validated.estimatedHours !== undefined && validated.estimatedHours !== existingSR.estimatedHours) {
      intakeChanges.push(`예상 작업 시간 변경: ${existingSR.estimatedHours}시간 → ${validated.estimatedHours}시간`);
    }
    if (validated.estimatedCompletionDate &&
        new Date(validated.estimatedCompletionDate).getTime() !== existingSR.estimatedCompletionDate?.getTime()) {
      intakeChanges.push(`예상 완료일 변경`);
    }

    if (intakeChanges.length > 0) {
      await this.srActivityRepository.create({
        srId: id,
        userId: sessionUser.id,
        type: "COMMENTED",
        description: `SR 접수 정보가 수정되었습니다:\n${intakeChanges.join('\n')}`,
        metadata: {
          actualPriority: validated.actualPriority,
          estimatedHours: validated.estimatedHours,
          estimatedCompletionDate: validated.estimatedCompletionDate,
        }
      });
    }

    const sr = await this.srRepository.update(id, updateData);

    // We will handle email notifications separately
    return sr;
  }

  async getSRById(id: string) {
    // Service 레이어를 통해 필요한 모든 관련 데이터를 함께 가져옴
    const sr = await this.srRepository.findById(id);
    if (!sr) {
      return null;
    }

    // SR 데이터에 comments와 activities가 포함되도록 보장
    // Repository에서 include를 통해 이미 관련 데이터를 가져왔기 때문에
    // 바로 반환
    return sr;
  }

  // 기존 API 라우트와 이름을 일치시키기 위한 별칭 함수들
  async getSrById(id: string) {
    return this.getSRById(id);
  }

  async getAllSrs(filters: { status?: string; clientId?: string; priority?: string }) {
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

    // Include assignee information in the query
    const srs = await this.srRepository.findAll({
      where,
      orderBy: {
        createdAt: "desc",
      },
    });

    // Map assignee to assignedTo for frontend compatibility
    const mappedSrs = srs.map((sr) => ({
      ...sr,
      assignedTo: sr.assignee || null,
    }));

    return mappedSrs;
  }

  async createSr(data: any, sessionUser: any) {
    return this.createSR(data, sessionUser);
  }

  async deleteSr(id: string) {
    return this.deleteSR(id);
  }

  async getAllSRs(filters: { status?: string; clientId?: string; priority?: string }) {
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

    const srs = await this.srRepository.findAll({
      where,
      orderBy: {
        createdAt: "desc",
      },
    });

    // Map assignee to assignedTo for frontend compatibility
    const mappedSrs = srs.map((sr) => ({
      ...sr,
      assignedTo: sr.assignee || null,
    }));

    return mappedSrs;
  }

  async deleteSR(id: string) {
    const existingSR = await this.srRepository.findById(id);
    if (!existingSR) {
      throw new Error("SR을 찾을 수 없습니다.");
    }

    // Only allow deletion if status is REQUESTED or REJECTED
    if (!["REQUESTED", "REJECTED"].includes(existingSR.status)) {
      throw new Error("진행 중이거나 완료된 SR은 삭제할 수 없습니다.");
    }

    await this.srRepository.delete(id);

    return { message: "SR이 삭제되었습니다." };
  }
}

// 서비스 인스턴스 생성
const srServiceInstance = new SRService();

// 개별 함수 내보내기
export const getSrById = async (id: string) => {
  return srServiceInstance.getSRById(id);
};

export const getAllSrs = async (filters: { status?: string; clientId?: string; priority?: string }) => {
  return srServiceInstance.getAllSRs(filters);
};

export const createSr = async (data: any, sessionUser: any) => {
  return srServiceInstance.createSr(data, sessionUser);
};

export const deleteSr = async (id: string) => {
  return srServiceInstance.deleteSR(id);
};