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

    // SR 번호 생성 (중복 방지를 위한 재시도 로직)
    let sr: SR | null = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (!sr && attempts < maxAttempts) {
      attempts++;
      
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

      // 오늘 날짜의 시작과 끝 시간 계산 (원본 today 객체 보존)
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);

      // 오늘 생성된 SR 개수 조회
      const todayCount = await this.srRepository.count({
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      });

      // SR 번호 생성 (시도 횟수만큼 증가)
      const sequenceNumber = todayCount + attempts;
      const srNumber = `SR-${dateStr}-${String(sequenceNumber).padStart(4, "0")}`;

      try {
        sr = await this.srRepository.create({
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
      } catch (error) {
        // 중복 키 에러인 경우 재시도
        const isUniqueConstraintError = 
          (error instanceof Error && error.message.includes("Unique constraint")) ||
          (error && typeof error === "object" && "code" in error && error.code === "P2002");
        
        if (isUniqueConstraintError) {
          if (attempts >= maxAttempts) {
            throw new Error("SR 번호 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
          }
          // 짧은 지연 후 재시도 (동시성 문제 완화)
          await new Promise(resolve => setTimeout(resolve, 50 * attempts));
          continue;
        }
        // 다른 에러는 즉시 throw
        throw error;
      }
    }

    if (!sr) {
      throw new Error("SR 생성에 실패했습니다.");
    }

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

      // 권한 체크: REQUESTED 상태인 경우 요청자 또는 ADMIN만 수정 가능
      const isAdmin = sessionUser.roles?.includes("ADMIN") ?? false;
      const isRequester = existingSR.requesterId === sessionUser.id;
      
      if (existingSR.status === "REQUESTED") {
        if (!isAdmin && !isRequester) {
          throw new Error("SR 수정 권한이 없습니다. 요청자 또는 관리자만 수정할 수 있습니다.");
        }
      } else {
        // REQUESTED가 아닌 경우 ADMIN만 수정 가능
        if (!isAdmin) {
          throw new Error("SR 수정 권한이 없습니다. 관리자만 수정할 수 있습니다.");
        }
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
    intakeBy: { id: string; name: string; email: string; image: string | null } | null;
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
    statusHistory: Array<{
      id: string;
      currentStatus: string;
      previousStatus: string | null;
      changedAt: Date;
      user: { id: string; name: string; image: string | null };
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

    counts.forEach((count: { srId: string; _count: { _all: number } }) => {
      commentCountsMap[count.srId] = count._count._all;
    });

    attachmentCounts.forEach((count: { srId: string; _count: { _all: number } }) => {
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

  async deleteSR(id: string, sessionUser?: AuthenticatedUser) {
    if (!sessionUser) {
      throw new Error("인증이 필요합니다.");
    }

    const existingSR = await this.srRepository.findById(id);
    if (!existingSR) {
      throw new Error("SR을 찾을 수 없습니다.");
    }
    
    // 권한 체크: REQUESTED, REJECTED 상태인 경우 요청자 또는 ADMIN만 삭제 가능
    const isAdmin = sessionUser.roles?.includes("ADMIN") ?? false;
    const isRequester = existingSR.requesterId === sessionUser.id;
    
    if (["REQUESTED", "REJECTED"].includes(existingSR.status)) {
      if (!isAdmin && !isRequester) {
        throw new Error("SR 삭제 권한이 없습니다. 요청자 또는 관리자만 삭제할 수 있습니다.");
      }
    } else {
      // 다른 상태는 ADMIN만 삭제 가능
      if (!isAdmin) {
        throw new Error("진행 중이거나 완료된 SR은 관리자만 삭제할 수 있습니다.");
      }
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