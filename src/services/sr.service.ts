import { User, Prisma } from "@prisma/client";
import { z } from "zod";
import { SRRepository } from "@/repositories/sr.repository";
import { SRActivityRepository } from "@/repositories/sr-activity.repository";
import { SRCommentRepository } from "@/repositories/sr-comment.repository";
import { ClientRepository } from "@/repositories/client.repository";
import { ServiceCategoryRepository } from "@/repositories/service-category.repository";
import { srCreateSchema, srUpdateSchema } from "@/lib/schemas";

type SrUpdateData = z.infer<typeof srUpdateSchema>;
type SrCreateData = z.infer<typeof srCreateSchema>;

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

  async updateSR(id: string, data: SrUpdateData, sessionUser: User) {
    const validated = srUpdateSchema.parse(data);
    const existingSR = await this.srRepository.findById(id);
    if (!existingSR) {
      throw new Error("SR을 찾을 수 없습니다.");
    }

    const updateData: Record<string, unknown> = { ...validated };

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
    
    const newAssigneeId = validated.assigneeId || validated.assignedToId;
    if (newAssigneeId !== undefined && newAssigneeId !== existingSR.assigneeId) {
      await this.srActivityRepository.create({
        srId: id,
        userId: sessionUser.id,
        type: "ASSIGNED",
        description: newAssigneeId ? "담당자가 할당되었습니다." : "담당자 할당이 해제되었습니다.",
      });
    }

    return this.srRepository.update(id, updateData);
  }

  async getSRById(id: string) {
    return this.srRepository.findById(id);
  }

  async getAllSRs(params: {
    where?: Prisma.SRWhereInput;
    orderBy?: Prisma.SROrderByWithRelationInput;
    skip?: number;
    take?: number;
  }) {
    const { where, orderBy, skip, take } = params;
    const srs = await this.srRepository.findAll({ where, orderBy, skip, take });
    return srs.map((sr) => ({ ...sr, assignedTo: sr.assignee || null }));
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

export const createSr = async (data: SrCreateData, sessionUser: { id: string; email: string }) => {
  return srServiceInstance.createSR(data, sessionUser);
};

export const deleteSr = async (id: string) => {
  return srServiceInstance.deleteSR(id);
};