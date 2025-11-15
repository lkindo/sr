import { User, Prisma, SR } from "@prisma/client";
import { z } from "zod";
import { SRRepository } from "@/repositories/sr.repository";
import { SRActivityRepository } from "@/repositories/sr-activity.repository";
import { SRCommentRepository } from "@/repositories/sr-comment.repository";
import { SRAttachmentRepository } from "@/repositories/sr-attachment.repository";
import { ClientRepository } from "@/repositories/client.repository";
import { ServiceCategoryRepository } from "@/repositories/service-category.repository";
import { srCreateSchema, srUpdateSchema } from "@/lib/schemas";
import { AuthenticatedUser } from "@/types/session";

type SrUpdateData = z.infer<typeof srUpdateSchema>;
type SrCreateData = z.infer<typeof srCreateSchema>;

export class SRService {
  constructor(
    private srRepository: SRRepository = new SRRepository(),
    private srActivityRepository: SRActivityRepository = new SRActivityRepository(),
    private srCommentRepository: SRCommentRepository = new SRCommentRepository(),
    private srAttachmentRepository: SRAttachmentRepository = new SRAttachmentRepository(),
    private clientRepository: ClientRepository = new ClientRepository(),
    private serviceCategoryRepository: ServiceCategoryRepository = new ServiceCategoryRepository()
  ) {}

  async createSR(
    data: SrCreateData,
    sessionUser: AuthenticatedUser
  ): Promise<SR & {
    client: { id: string; code: string; name: string };
    requester: { id: string; name: string; email: string };
    assignee: { id: string; name: string; email: string } | null;
    serviceCategory: { id: string; categoryName: string };
    comments: unknown[];
    activities: unknown[];
    attachments: unknown[];
    _count: { comments: number; attachments: number };
  }> {
    const validated = srCreateSchema.parse(data);

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const todayEnd = new Date(today.setHours(23, 59, 59, 999));

    const todayCount = await this.srRepository.count({
      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    });

    const srNumber = `SR-${dateStr}-${String(todayCount + 1).padStart(4, "0")}`;

    const sr = await this.srRepository.create({
      srNumber,
      title: validated.title,
      description: validated.description,
      clientId: validated.clientId,
      serviceCategoryId: validated.serviceCategoryId,
      requesterId: sessionUser.id,
      requestedPriority: validated.requestedPriority,
      priority: validated.requestedPriority,
      requestedCompletionDate: validated.requestedCompletionDate
        ? new Date(validated.requestedCompletionDate)
        : undefined,
      status: "REQUESTED",
    });

    await this.srActivityRepository.create({
      srId: sr.id,
      userId: sessionUser.id,
      type: "CREATED",
      description: "SR이 생성되었습니다.",
    });

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

    // 관계 데이터를 포함하여 반환
    return this.srRepository.findDetailsById(sr.id);
  }

  async updateSR(
    id: string,
    data: SrUpdateData,
    sessionUser: AuthenticatedUser
  ): Promise<SR & {
    client?: { id: string; code: string; name: string };
    requester?: { id: string; name: string; email: string };
    assignee?: { id: string; name: string; email: string } | null;
    serviceCategory?: { id: string; categoryName: string };
  }> {
    // Prisma 업데이트 데이터 준비 (undefined 제거 및 필드 매핑)
    const updateData: Prisma.SRUncheckedUpdateInput = {};
    
    try {
      const validated = srUpdateSchema.parse(data);
      const existingSR = await this.srRepository.findById(id);
      if (!existingSR) {
        throw new Error("SR을 찾을 수 없습니다.");
      }

    // 기본 필드 처리
    if (validated.title !== undefined) {
      updateData.title = validated.title;
    }
    if (validated.description !== undefined) {
      updateData.description = validated.description;
    }
    if (validated.priority !== undefined) {
      updateData.priority = validated.priority;
    }
    if (validated.status !== undefined) {
      updateData.status = validated.status;
    }
    if (validated.actualPriority !== undefined) {
      updateData.actualPriority = validated.actualPriority;
    }
    if (validated.estimatedHours !== undefined) {
      updateData.estimatedHours = typeof validated.estimatedHours === 'string' 
        ? parseFloat(validated.estimatedHours) 
        : validated.estimatedHours;
    }
    if (validated.intakeNotes !== undefined) {
      updateData.intakeNotes = validated.intakeNotes || null;
    }
    if (validated.resolutionDescription !== undefined) {
      updateData.resolutionDescription = validated.resolutionDescription || null;
    }
    if (validated.rejectionReason !== undefined) {
      updateData.rejectionReason = validated.rejectionReason || null;
    }
    if (validated.satisfactionRating !== undefined) {
      updateData.satisfactionRating = validated.satisfactionRating || null;
    }
    if (validated.additionalFeedback !== undefined) {
      updateData.additionalFeedback = validated.additionalFeedback || null;
    }

    // 날짜 필드 처리
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
    if (validated.estimatedCompletionDate !== undefined) {
      updateData.estimatedCompletionDate = validated.estimatedCompletionDate 
        ? new Date(validated.estimatedCompletionDate) 
        : null;
    }

    // 관계형 필드 처리
    if (validated.serviceCategoryId !== undefined) {
      if (validated.serviceCategoryId) {
        updateData.serviceCategoryId = validated.serviceCategoryId;
      }
      // null인 경우 업데이트하지 않음 (필수 필드이므로)
    }

    // 담당자 필드 처리 (assignedToId → assigneeId 매핑)
    const assigneeId = validated.assigneeId || validated.assignedToId;
    if (assigneeId !== undefined) {
      updateData.assigneeId = assigneeId || null;
    }

    // Additional logic from original method
    if (validated.actualPriority && validated.actualPriority !== existingSR.actualPriority) {
        const serviceCategory = await this.serviceCategoryRepository.findById(
          existingSR.serviceCategoryId
        );
        if (serviceCategory) {
          const priorityMultiplier = { CRITICAL: 0.5, HIGH: 0.75, MEDIUM: 1.0, LOW: 1.5 };
          const adjustedHours = serviceCategory.slaHours * priorityMultiplier[validated.actualPriority];
          const dueDate = new Date(existingSR.intakeAt || new Date());
          dueDate.setHours(dueDate.getHours() + adjustedHours);
          updateData.dueDate = dueDate;
        }
    }
    
    if (validated.status && validated.status !== existingSR.status) {
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
      await this.srActivityRepository.create({
        srId: id,
        userId: sessionUser.id,
        type: "STATUS_CHANGED",
        description: `상태가 ${existingSR.status}에서 ${validated.status}로 변경되었습니다.`,
      });
      if (validated.status === "COMPLETED" && !updateData.actualCompletionDate) {
        updateData.actualCompletionDate = new Date();
      }
    }
    
    if (assigneeId !== undefined && assigneeId !== existingSR.assigneeId) {
      await this.srActivityRepository.create({
        srId: id,
        userId: sessionUser.id,
        type: "ASSIGNED",
        description: assigneeId ? "담당자가 할당되었습니다." : "담당자 할당이 해제되었습니다.",
      });
    }

    // updateData가 비어있으면 업데이트할 것이 없음
    if (Object.keys(updateData).length === 0) {
      return existingSR;
    }

    return this.srRepository.update(id, updateData);
    } catch (error) {
      const { logger } = await import("@/lib/logger");
      logger.error("SR 업데이트 서비스 오류", error instanceof Error ? error : undefined, {
        srId: id,
        updateData: Object.keys(updateData),
      });
      throw error;
    }
  }

  async getSRById(id: string): Promise<SR | null> {
    return this.srRepository.findById(id);
  }

  async getSRDetailsById(id: string): Promise<(SR & {
    client: { id: string; code: string; name: string };
    requester: { id: string; name: string; email: string };
    assignee: { id: string; name: string; email: string } | null;
    serviceCategory: { id: string; categoryName: string };
    comments: Array<{
      id: string;
      content: string;
      createdAt: Date;
      updatedAt: Date;
      user: { id: string; name: string; email: string };
    }>;
    activities: Array<{
      id: string;
      type: string;
      description: string;
      createdAt: Date;
      user: { id: string; name: string; email: string };
    }>;
    attachments: Array<{
      id: string;
      fileName: string;
      fileSize: number;
      fileType: string;
      fileUrl: string;
      createdAt: Date;
    }>;
    _count: { comments: number; attachments: number };
  }) | null> {
    return this.srRepository.findDetailsById(id);
  }

  async getAllSRs(params: {
    where?: Prisma.SRWhereInput;
    orderBy?: Prisma.SROrderByWithRelationInput;
    skip?: number;
    take?: number;
  }) {
    const { where, orderBy, skip, take } = params;
    const srs = await this.srRepository.findAll({ where, orderBy, skip, take });
    
    // Count comments and attachments for each SR
    const srIds = srs.map(sr => sr.id);
    const counts = await this.srCommentRepository.countBySrs(srIds);
    const attachmentCounts = await this.srAttachmentRepository.countBySrs(srIds);
    
    // Create maps for quick lookup
    const commentCountsMap: Record<string, number> = {};
    const attachmentCountsMap: Record<string, number> = {};

    counts.forEach((count) => {
      commentCountsMap[count.srId] = count._count._all;
    });

    attachmentCounts.forEach((count) => {
      attachmentCountsMap[count.srId] = count._count._all;
    });
    
    // Add counts to each SR
    return srs.map((sr) => ({ 
      ...sr, 
      assignedTo: sr.assignee || null,
      _count: {
        comments: commentCountsMap[sr.id] || 0,
        attachments: attachmentCountsMap[sr.id] || 0,
      }
    }));
  }

  async countSRs(params: { where?: Prisma.SRWhereInput }) {
    const { where } = params;
    return this.srRepository.count(where);
  }

  async deleteSR(id: string) {
    const existingSR = await this.srRepository.findById(id);
    if (!existingSR) {
      throw new Error("SR을 찾을 수 없습니다.");
    }
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
  // Convert filters to the expected format for SRService.getAllSRs
  const whereFilters: Prisma.SRWhereInput = {};
  if (filters.status) whereFilters.status = filters.status as Prisma.SRWhereInput['status'];
  if (filters.clientId) whereFilters.clientId = filters.clientId;
  if (filters.priority) whereFilters.priority = filters.priority as Prisma.SRWhereInput['priority'];

  return srServiceInstance.getAllSRs({ where: whereFilters });
};

export const createSr = async (data: SrCreateData, sessionUser: AuthenticatedUser) => {
  return srServiceInstance.createSR(data, sessionUser);
};

export const deleteSr = async (id: string) => {
  return srServiceInstance.deleteSR(id);
};