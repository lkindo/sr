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
   *
   * 프로세스:
   * 1. 권한 검증 (SR:CREATE 또는 SR:CREATE_SELF)
   * 2. SR 번호 자동 생성 (형식: SR-YYYYMMDD-0001)
   * 3. 중복 방지를 위한 재시도 로직 (최대 10회)
   * 4. SR 생성 활동 로그 기록
   * 5. MANAGER 역할 사용자에게 이메일 알림 발송 (비동기)
   *
   * @param data - SR 생성 데이터
   * @param data.title - SR 제목 (5자 이상)
   * @param data.description - SR 상세 설명 (10자 이상)
   * @param data.clientId - 고객사 ID
   * @param data.serviceCategoryId - 서비스 카테고리 ID
   * @param data.requestedPriority - 요청 우선순위 (CRITICAL, HIGH, MEDIUM, LOW)
   * @param data.requestedCompletionDate - 요청 완료 희망일 (선택)
   * @param sessionUser - 요청 생성자 (세션 사용자)
   *
   * @returns 생성된 SR (고객사, 요청자, 서비스 카테고리 포함)
   *
   * @throws {ValidationError} 입력 데이터 검증 실패
   * @throws {ForbiddenError} SR 생성 권한 없음
   * @throws {Error} SR 번호 생성 실패 (재시도 10회 초과)
   *
   * @example
   * ```typescript
   * const sr = await srService.createSR({
   *   title: '로그인 오류 수정 요청',
   *   description: '로그인 시 500 에러 발생',
   *   clientId: 'client-123',
   *   serviceCategoryId: 'cat-456',
   *   requestedPriority: 'HIGH',
   * }, sessionUser);
   * ```
   */
  async createSR(
    data: SrCreateData,
    sessionUser: AuthenticatedUser
  ): Promise<SR & {
    client: { id: string; code: string; name: string };
    requester: { id: string; name: string; email: string };
    assignee: { id: string; name: string; email: string } | null;
    serviceCategory: { id: string; categoryName: string };
    comments: (import("@prisma/client").SRComment & { user: { id: string; name: string; image: string | null } })[];
    activities: (import("@prisma/client").SRActivity & { user: { id: string; name: string; image: string | null } })[];
    attachments: import("@prisma/client").SRAttachment[];
    _count: { comments: number; attachments: number };
  }> {
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

    // 초기 생성 Activity 로그 1회 생성
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

      // 권한 체크 (SRPolicy 사용)
      this.srPolicy.ensureCanUpdate(sessionUser, existingSR);

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
      user: { id: string; name: string; image: string | null };
    }>;
    activities: Array<{
      id: string;
      type: string;
      description: string;
      createdAt: Date;
      user: { id: string; name: string; image: string | null };
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

  async getAllSRs(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRWhereInput;
    orderBy?: Prisma.SROrderByWithRelationInput;
  }): Promise<(SR & {
    client: { id: string; name: string };
    requester: { id: string; name: string; email: string };
    assignee: { id: string; name: string; email: string } | null;
    serviceCategory: {
      id: string;
      categoryName: string;
      priority: string;
      slaHours: number;
      handlerId: string | null;
      handler: { id: string; name: string } | null;
    };
    _count: { comments: number; attachments: number };
  })[]> {
    return this.srRepository.findAll(params);
  }

  async countSRs(params?: { where?: Prisma.SRWhereInput }): Promise<number> {
    return this.srRepository.count(params?.where);
  }

  async deleteSR(id: string, sessionUser: AuthenticatedUser): Promise<void> {
    const existingSR = await this.srRepository.findById(id);
    if (!existingSR) {
      throw new Error("SR을 찾을 수 없습니다.");
    }

    // 권한 체크 (SRPolicy 사용)
    this.srPolicy.ensureCanDelete(sessionUser);

    await this.srRepository.delete(id);
    await this.srActivityRepository.create({
      srId: id,
      userId: sessionUser.id,
      type: "STATUS_CHANGED",
      description: "SR이 삭제되었습니다.",
    });
  }
}