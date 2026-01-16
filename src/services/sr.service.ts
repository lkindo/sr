import { Prisma, SR, SRStatus } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { z } from "zod";
import { pushService } from "@/services/push.service";
import { emailService } from "@/services/email.service";
import { srCreateSchema, srUpdateSchema } from "@/lib/schemas";
import { AuthenticatedUser } from "@/types/session";
import { ensureCanCreateSR, ensureCanUpdateSR, ensureCanDeleteSR } from "@/lib/policies";
import { SRCreateResult, SRUpdateResult, SRDetails, SRListItem } from "@/types/sr.types";
import prisma from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { backgroundTask } from "@/lib/wait-until";
import { getSRUrl } from "@/lib/app-url";
import { logger } from "@/lib/logger";
import { validateTransition, getRequiredFields } from "@/lib/sr-state-machine";

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
  constructor() { }

  /**
   * SR을 생성합니다.
   */
  async createSR(
    data: SrCreateData,
    sessionUser: AuthenticatedUser
  ): Promise<SRCreateResult> {
    ensureCanCreateSR(sessionUser);
    const validated = srCreateSchema.parse(data);

    // 고객사 활성 상태 확인
    const client = await prisma.client.findUnique({ where: { id: validated.clientId } });
    if (!client) {
      throw new NotFoundError("고객사");
    }
    if (!client.isActive) {
      throw new Error(
        `비활성 상태의 고객사(${client.name})에는 SR을 생성할 수 없습니다. ` +
        `고객사 관리자에게 문의하세요.`
      );
    }

    // SR 번호 생성 (트랜잭션으로 동시성 문제 해결)
    let sr: SR | null = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (!sr && attempts < maxAttempts) {
      attempts++;

      try {
        // 트랜잭션 내에서 SR 번호 생성 및 SR 생성을 원자적으로 수행
        sr = await prisma.$transaction(async (tx) => {
          const today = new Date();
          const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

          // 가장 마지막 SR 번호 조회 (count는 삭제된 SR이 있을 경우 중복 번호를 생성할 수 있음)
          const lastSR = await tx.sR.findFirst({
            where: {
              srNumber: {
                startsWith: `SR-${dateStr}-`,
              },
            },
            orderBy: {
              srNumber: "desc",
            },
            select: {
              srNumber: true,
            },
          });

          let sequenceNumber = 1;
          if (lastSR) {
            const lastSequence = parseInt(lastSR.srNumber.split("-")[2]);
            if (!isNaN(lastSequence)) {
              sequenceNumber = lastSequence + 1;
            }
          }

          const srNumber = `SR-${dateStr}-${String(sequenceNumber).padStart(4, "0")}`;

          // SR 생성 (unique constraint 체크는 DB 레벨에서 발생)
          return await tx.sR.create({
            data: {
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
            },
          });
        }, {
          isolationLevel: 'Serializable', // 최고 수준의 격리 레벨
          maxWait: 5000, // 5초 대기
          timeout: 10000, // 10초 타임아웃
        });
      } catch (error) {
        const isUnique =
          (error instanceof Error && error.message.includes("Unique constraint")) ||
          (error instanceof PrismaClientKnownRequestError && error.code === "P2002");

        if (isUnique && attempts < maxAttempts) {
          // Unique constraint 위반 시 exponential backoff로 재시도
          await new Promise(res => setTimeout(res, 50 * Math.pow(2, attempts - 1)));
          continue;
        }

        if (attempts >= maxAttempts) {
          throw new Error("SR 번호 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }

        throw error;
      }
    }

    if (!sr) {
      throw new Error("SR 생성에 실패했습니다.");
    }

    await prisma.sRActivity.create({
      data: {
        srId: sr.id,
        userId: sessionUser.id,
        type: "CREATED",
        description: "SR이 생성되었습니다.",
      }
    });

    await prisma.sR.update({
      where: { id: sr.id },
      data: {
        statusHistory: {
          create: {
            previousStatus: null,
            currentStatus: "REQUESTED",
            changedBy: sessionUser.id,
            changeReason: "SR 생성",
          },
        },
      },
    });

    const result = await this.getSRDetailsById(sr.id);
    if (!result) {
      throw new Error("SR 생성 후 조회에 실패했습니다.");
    }



    // 푸시 알림 전송 (ADMIN, MANAGER)
    backgroundTask(
      prisma.user.findMany({
        where: {
          roles: { some: { role: { name: { in: ['ADMIN', 'MANAGER'] } } } },
          isActive: true
        },
        select: { id: true }
      }).then(users => {
        const adminIds = users.map(u => u.id);
        if (adminIds.length > 0) {
          return pushService.sendToUsers(adminIds, {
            title: "새로운 SR 등록",
            body: `${result.srNumber}: ${result.title}`,
            url: `/srs/${result.id}`,
            tag: 'sr-created'
          });
        }
      }),
      `Push notification for ${result.srNumber}`
    );

    // 이메일 알림 전송 (ADMIN, MANAGER)
    backgroundTask(
      prisma.user.findMany({
        where: {
          roles: { some: { role: { name: { in: ['ADMIN', 'MANAGER'] } } } },
          isActive: true
        },
        include: { notificationPreference: true }
      }).then(admins => {
        const emailPromises = admins
          .filter(admin => {
            const shouldSend = admin.notificationPreference?.emailSRCreated ?? true;
            return admin.email && shouldSend;
          })
          .map(admin =>
            emailService.sendSRCreated(
              admin.email!,
              result.srNumber,
              result.title,
              result.requester.name,
              getSRUrl(result.id)
            )
          );
        return Promise.all(emailPromises);
      }),
      `Email notifications for ${result.srNumber}`
    );

    return result;
  }



  async updateSR(
    id: string,
    data: SrUpdateData,
    sessionUser: AuthenticatedUser
  ): Promise<SRUpdateResult> {
    try {
      const validated = srUpdateSchema.parse(data);
      const existingSR = await prisma.sR.findUnique({ where: { id } });
      if (!existingSR) throw new NotFoundError("SR");

      ensureCanUpdateSR(sessionUser, existingSR);

      // 고객사 변경 검증 (REQUESTED 상태에서만 허용)
      if (validated.clientId && validated.clientId !== existingSR.clientId) {
        if (existingSR.status !== 'REQUESTED') {
          throw new Error(
            `SR이 이미 접수된 상태(${existingSR.status})입니다. ` +
            `접수 후에는 고객사를 변경할 수 없습니다. ` +
            `잘못된 고객사로 생성된 경우 SR을 삭제하고 다시 생성하세요.`
          );
        }

        // 새 고객사가 활성 상태인지 확인
        const newClient = await prisma.client.findUnique({ where: { id: validated.clientId } });
        if (!newClient) {
          throw new NotFoundError("변경하려는 고객사");
        }
        if (!newClient.isActive) {
          throw new Error(
            `비활성 상태의 고객사(${newClient.name})로는 변경할 수 없습니다.`
          );
        }
      }

      // 상태 전환 검증
      if (validated.status && validated.status !== existingSR.status) {


        const transitionResult = validateTransition(
          existingSR.status,
          validated.status as SRStatus,
          sessionUser.roles
        );

        if (!transitionResult.valid) {
          throw new Error(transitionResult.message);
        }

        // 필수 필드 검증
        const requiredFields = getRequiredFields(validated.status as SRStatus);
        const missingFields: string[] = [];

        for (const field of requiredFields) {
          // validated에 있거나 existingSR에 있어야 함
          if (field === 'assigneeId') {
            if (!validated.assigneeId && !validated.assignedToId && !existingSR.assigneeId) {
              missingFields.push('담당자(assigneeId)');
            }
          } else if (field === 'resolutionDescription') {
            if (!validated.resolutionDescription && !existingSR.resolutionDescription) {
              missingFields.push('해결 내용(resolutionDescription)');
            }
          } else if (field === 'rejectionReason') {
            if (!validated.rejectionReason && !existingSR.rejectionReason) {
              missingFields.push('거절 사유(rejectionReason)');
            }
          }
        }

        if (missingFields.length > 0) {
          throw new Error(
            `${validated.status} 상태로 전환하려면 다음 필드가 필요합니다: ${missingFields.join(', ')}`
          );
        }
      }

      // 완료/확정 상태에서 담당자 변경 차단
      const assigneeId = validated.assigneeId || validated.assignedToId;
      if ((existingSR.status === 'COMPLETED' || existingSR.status === 'CONFIRMED') &&
        assigneeId !== undefined && assigneeId !== existingSR.assigneeId) {
        throw new Error(
          "완료되거나 확정된 SR의 담당자는 변경할 수 없습니다. " +
          "변경이 필요한 경우 SR을 다시 열어주세요."
        );
      }

      const updateData: Prisma.SRUncheckedUpdateInput = {};

      // basic fields
      if (validated.title !== undefined) updateData.title = validated.title;
      if (validated.description !== undefined) updateData.description = validated.description;
      if (validated.clientId !== undefined) updateData.clientId = validated.clientId;
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

      if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;

      // priority SLA adjustment
      if (validated.actualPriority && validated.actualPriority !== existingSR.actualPriority) {
        const serviceCategory = await prisma.serviceCategory.findUnique({ where: { id: existingSR.serviceCategoryId } });
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
        // 1. SR 업데이트 (statusHistory 포함)
        let updatedSR: SRUpdateResult = existingSR;

        if (Object.keys(updateData).length > 0) {
          updatedSR = await tx.sR.update({
            where: { id },
            data: updateData,
            include: {
              client: { select: { id: true, code: true, name: true } },
              requester: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  notificationPreference: true // 추가
                }
              },
              assignee: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  notificationPreference: true // 추가
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
                      name: true
                    }
                  }
                }
              },
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

          // 상태 변경 푸시 알림 (요청자에게)
          if (existingSR.requesterId) {
            backgroundTask(
              pushService.sendToUser(existingSR.requesterId, {
                title: "SR 상태 변경",
                body: `${existingSR.srNumber} 상태가 ${validated.status}로 변경되었습니다.`,
                url: `/srs/${id}`,
                tag: 'sr-status-changed'
              }),
              `Status change push for ${existingSR.srNumber}`
            );
          }

          // 상태 변경 이메일 알림 (요청자에게)
          const srWithRelations = updatedSR;
          const requesterPrefs = srWithRelations.requester?.notificationPreference;
          const shouldSendStatusEmail = requesterPrefs?.emailSRStatusChanged ?? false;

          if (srWithRelations.requester?.email && shouldSendStatusEmail) {
            backgroundTask(
              emailService.sendSRStatusChanged(
                srWithRelations.requester.email,
                srWithRelations.srNumber,
                srWithRelations.title,
                existingSR.status,
                validated.status!,
                getSRUrl(id)
              ),
              `Status change email for ${existingSR.srNumber}`
            );
          }
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

          // 담당자 배정 푸시 알림 (새 담당자에게)
          if (assigneeId) {
            backgroundTask(
              pushService.sendToUser(assigneeId, {
                title: "SR 담당 배정",
                body: `${existingSR.srNumber} 담당자로 배정되었습니다.`,
                url: `/srs/${id}`,
                tag: 'sr-assigned'
              }),
              `Assignment push for ${existingSR.srNumber}`
            );
          }

          // 담당자 배정 이메일 알림
          const srWithRelations = updatedSR;
          const assigneePrefs = srWithRelations.assignee?.notificationPreference;
          const shouldSendAssignEmail = assigneePrefs?.emailSRAssigned ?? true;

          if (srWithRelations.assignee?.email && shouldSendAssignEmail) {
            backgroundTask(
              emailService.sendSRAssigned(
                srWithRelations.assignee.email,
                srWithRelations.srNumber,
                srWithRelations.title,
                srWithRelations.assignee.name,
                getSRUrl(id)
              ),
              `Assignment email for ${existingSR.srNumber}`
            );
          }
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
    return prisma.sR.findUnique({ where: { id } });
  }

  async getSRDetailsById(id: string, options?: { activitiesLimit?: number; commentsLimit?: number }): Promise<SRDetails | null> {
    const { activitiesLimit = 20, commentsLimit = 20 } = options || {};

    return prisma.sR.findUnique({
      where: { id },
      include: {
        client: true,
        requester: {
          select: { id: true, name: true, email: true, image: true },
        },
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
        intakeBy: {
          select: { id: true, name: true, email: true, image: true },
        },
        serviceCategory: true,
        activities: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: activitiesLimit,
        },
        comments: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: commentsLimit,
        },
        attachments: {
          orderBy: { createdAt: "desc" },
        },
        statusHistory: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { changedAt: "desc" },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
    }) as Promise<SRDetails | null>;
  }

  async getAllSRs(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.SRWhereInput;
    orderBy?: Prisma.SROrderByWithRelationInput;
  }): Promise<SRListItem[]> {
    const { skip, take, where, orderBy } = params || {};

    return prisma.sR.findMany({
      skip,
      take,
      where,
      orderBy,
      include: {
        client: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        serviceCategory: {
          select: {
            id: true,
            categoryName: true,
            priority: true,
            slaHours: true,
            handlerId: true,
            handler: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
    }) as Promise<SRListItem[]>;
  }

  async countSRs(params?: { where?: Prisma.SRWhereInput }): Promise<number> {
    return prisma.sR.count({ where: params?.where });
  }

  async deleteSR(id: string, sessionUser: AuthenticatedUser): Promise<void> {
    const existingSR = await prisma.sR.findUnique({ where: { id } });
    if (!existingSR) throw new NotFoundError("SR");
    ensureCanDeleteSR(sessionUser);

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
    const { skip = 0, take = 20 } = options || {};
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