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
import { SRPolicy } from "@/lib/policies/sr.policy";
import { SRCreateResult, SRUpdateResult, SRDetails, SRListItem } from "@/types/sr.types";
import prisma from "@/lib/prisma";

type SrUpdateData = z.infer<typeof srUpdateSchema>;
type SrCreateData = z.infer<typeof srCreateSchema>;

/**
 * SR (Service Request) 서비스
 *
 * SR의 생명주기 관리 및 비즈니스 로직을 처리합니다.
 * - SR 생성, 조회, 수정, 삭제
 * - SR 접수 처리 (Intake)
 * - 활동 로그 자동 기록
 * - 권한 정책 적용
 */
export class SRService {
  constructor(
    private srRepository: SRRepository = new SRRepository(),
    private srActivityRepository: SRActivityRepository = new SRActivityRepository(),
    private srCommentRepository: SRCommentRepository = new SRCommentRepository(),
    private srAttachmentRepository: SRAttachmentRepository = new SRAttachmentRepository(),
    private clientRepository: ClientRepository = new ClientRepository(),
    private serviceCategoryRepository: ServiceCategoryRepository = new ServiceCategoryRepository(),
    private srPolicy: SRPolicy = new SRPolicy()
  ) { }

  /**
   * SR을 생성합니다.
   */
  async createSR(
    data: SrCreateData,
    sessionUser: AuthenticatedUser
  ): Promise<SRCreateResult> {
    this.srPolicy.ensureCanCreate(sessionUser);
    const validated = srCreateSchema.parse(data);

    // SR 번호 생성 (중복 방지를 위한 재시도 로직)
    let sr: SR | null = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (!sr && attempts < maxAttempts) {
      attempts++;
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);

      const todayCount = await this.srRepository.count({
        createdAt: { gte: todayStart, lte: todayEnd },
      });

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
        const isUnique =
          (error instanceof Error && error.message.includes("Unique constraint")) ||
          (error && typeof error === "object" && "code" in error && (error as any).code === "P2002");
        if (isUnique) {
          if (attempts >= maxAttempts) {
            throw new Error("SR 번호 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
          }
          await new Promise(res => setTimeout(res, 50 * attempts));
          continue;
        }
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

    const result = await this.srRepository.findDetailsById(sr.id);
    if (!result) {
      throw new Error("SR 생성 후 조회에 실패했습니다.");
    }
    return result;
  }

  async updateSR(
    id: string,
    data: SrUpdateData,
    sessionUser: AuthenticatedUser
  ): Promise<SRUpdateResult> {
    try {
      const validated = srUpdateSchema.parse(data);
      const existingSR = await this.srRepository.findById(id);
      if (!existingSR) throw new Error("SR을 찾을 수 없습니다.");

      this.srPolicy.ensureCanUpdate(sessionUser, existingSR);

      const updateData: Prisma.SRUncheckedUpdateInput = {};

      // basic fields
      if (validated.title !== undefined) updateData.title = validated.title;
      if (validated.description !== undefined) updateData.description = validated.description;
      if (validated.priority !== undefined) updateData.priority = validated.priority;
      if (validated.status !== undefined) updateData.status = validated.status;
      if (validated.actualPriority !== undefined) updateData.actualPriority = validated.actualPriority;
      if (validated.estimatedHours !== undefined)
        updateData.estimatedHours = typeof validated.estimatedHours === "string"
          ? parseFloat(validated.estimatedHours)
          : validated.estimatedHours;
      if (validated.intakeNotes !== undefined) updateData.intakeNotes = validated.intakeNotes || null;
      if (validated.resolutionDescription !== undefined) updateData.resolutionDescription = validated.resolutionDescription || null;
      if (validated.rejectionReason !== undefined) updateData.rejectionReason = validated.rejectionReason || null;
      if (validated.satisfactionRating !== undefined) updateData.satisfactionRating = validated.satisfactionRating || null;
      if (validated.additionalFeedback !== undefined) updateData.additionalFeedback = validated.additionalFeedback || null;

      // dates
      if (validated.expectedCompletionDate !== undefined)
        updateData.expectedCompletionDate = validated.expectedCompletionDate ? new Date(validated.expectedCompletionDate) : null;
      if (validated.dueDate !== undefined)
        updateData.dueDate = validated.dueDate ? new Date(validated.dueDate) : null;
      if (validated.actualCompletionDate !== undefined)
        updateData.actualCompletionDate = validated.actualCompletionDate ? new Date(validated.actualCompletionDate) : null;
      if (validated.estimatedCompletionDate !== undefined)
        updateData.estimatedCompletionDate = validated.estimatedCompletionDate ? new Date(validated.estimatedCompletionDate) : null;

      // relations
      if (validated.serviceCategoryId !== undefined) {
        if (validated.serviceCategoryId) updateData.serviceCategoryId = validated.serviceCategoryId;
      }

      const assigneeId = validated.assigneeId || validated.assignedToId;
      if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;

      // priority SLA adjustment
      if (validated.actualPriority && validated.actualPriority !== existingSR.actualPriority) {
        const serviceCategory = await this.serviceCategoryRepository.findById(existingSR.serviceCategoryId);
        if (serviceCategory) {
          const multiplier: Record<string, number> = { CRITICAL: 0.5, HIGH: 0.75, MEDIUM: 1.0, LOW: 1.5 };
          const adjustedHours = serviceCategory.slaHours * multiplier[validated.actualPriority];
          const due = new Date(existingSR.intakeAt || new Date());
          due.setHours(due.getHours() + adjustedHours);
          updateData.dueDate = due;
        }
      }

      // 상태 변경 처리: statusHistory를 updateData에 포함
      const statusChanged = validated.status && validated.status !== existingSR.status;
      if (statusChanged) {
        updateData.statusHistory = {
          create: {
            previousStatus: existingSR.status,
            currentStatus: validated.status!,
            changedBy: sessionUser.id,
            changeReason: validated.changeReason || `상태 변경: ${existingSR.status} → ${validated.status}`,
          },
        };
        if (validated.status === "COMPLETED" && !updateData.actualCompletionDate) {
          updateData.actualCompletionDate = new Date();
        }
      }

      const assigneeChanged = assigneeId !== undefined && assigneeId !== existingSR.assigneeId;

      // 트랜잭션으로 업데이트 및 활동 로그 생성
      return await prisma.$transaction(async (tx) => {
        // 1. SR 업데이트 (statusHistory 포함)
        let updatedSR = existingSR;
        if (Object.keys(updateData).length > 0) {
          updatedSR = await tx.sR.update({
            where: { id },
            data: updateData,
            include: {
              client: { select: { id: true, code: true, name: true } },
              requester: { select: { id: true, name: true, email: true } },
              assignee: { select: { id: true, name: true, email: true } },
              serviceCategory: { select: { id: true, categoryName: true } },
            },
          });
        }

        // 2. 상태 변경 활동 로그
        if (statusChanged) {
          await tx.sRActivity.create({
            data: {
              srId: id,
              userId: sessionUser.id,
              type: "STATUS_CHANGED",
              description: `상태가 ${existingSR.status}에서 ${validated.status}로 변경되었습니다.`,
            },
          });
        }

        // 3. 담당자 변경 활동 로그
        if (assigneeChanged) {
          await tx.sRActivity.create({
            data: {
              srId: id,
              userId: sessionUser.id,
              type: "ASSIGNED",
              description: assigneeId ? "담당자가 할당되었습니다." : "담당자 할당이 해제되었습니다.",
            },
          });
        }

        return updatedSR;
      });
    } catch (error) {
      const { logger } = await import("@/lib/logger");
      logger.error("SR 업데이트 서비스 오류", error instanceof Error ? error : undefined, {
        srId: id,
      });
      throw error;
    }
  }

  async getSRById(id: string): Promise<SR | null> {
    return this.srRepository.findById(id);
  }

  async getSRDetailsById(id: string): Promise<SRDetails | null> {
    return this.srRepository.findDetailsById(id);
  }

  async getAllSRs(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRWhereInput;
    orderBy?: Prisma.SROrderByWithRelationInput;
  }): Promise<SRListItem[]> {
    return this.srRepository.findAll(params);
  }

  async countSRs(params?: { where?: Prisma.SRWhereInput }): Promise<number> {
    return this.srRepository.count(params?.where);
  }

  async deleteSR(id: string, sessionUser: AuthenticatedUser): Promise<void> {
    const existingSR = await this.srRepository.findById(id);
    if (!existingSR) throw new Error("SR을 찾을 수 없습니다.");
    this.srPolicy.ensureCanDelete(sessionUser);

    // 트랜잭션으로 관련 데이터와 함께 삭제
    await prisma.$transaction(async (tx) => {
      // 1. 관련 데이터 삭제 (Cascade가 설정되어 있지 않은 경우를 위해)
      await tx.sRActivity.deleteMany({ where: { srId: id } });
      await tx.sRComment.deleteMany({ where: { srId: id } });
      await tx.sRAttachment.deleteMany({ where: { srId: id } });
      await tx.sRStatusHistory.deleteMany({ where: { srId: id } });

      // 2. SR 삭제
      await tx.sR.delete({ where: { id } });
    });
  }
  /**
 * SR 상태 변경 이력 조회 (페이징 지원)
 */
async getStatusHistory(
  srId: string,
  options?: {
    skip?: number;
    take?: number;
  }
): Promise<{
  items: Array<{
    id: string;
    previousStatus: string | null;
    currentStatus: string;
    changedAt: Date;
    changeReason: string | null;
    user: {
      id: string;
      name: string;
      email: string;
      image: string | null;
    };
  }>;
  total: number;
}> {
  const { skip = 0, take = 20 } = options ||{};
  const [items, total] = await Promise.all([
    prisma.sRStatusHistory.findMany({
      where: { srId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { changedAt: "desc" },
      skip,
      take,
    }),
    prisma.sRStatusHistory.count({
      where: { srId },
    }),
  ]);
  return { items, total };
}
}