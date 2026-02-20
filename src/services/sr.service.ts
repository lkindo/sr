import { Prisma, SR, SRStatus } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { z } from 'zod';

import { getSRUrl } from '@/lib/app-url';
import { BusinessRuleError, NotFoundError, ServiceError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { ensureCanCreateSR, ensureCanDeleteSR, ensureCanUpdateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { emitRealtimeEvent, REALTIME_EVENTS } from '@/lib/realtime-events';
import { srCreateSchema, srUpdateSchema } from '@/lib/schemas';
import { getRequiredFields, validateTransition } from '@/lib/sr-state-machine';
import { backgroundTask } from '@/lib/wait-until';
import { emailService } from '@/services/email.service';
import { pushService } from '@/services/push.service';
import { serviceCategoryService } from '@/services/service-category.service';
import { AuthenticatedUser } from '@/types/session';
import { SRCreateResult, SRDetails, SRListItem, SRUpdateResult } from '@/types/sr.types';

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
  constructor() {}

  /**
   * Synchronizes the SR sequence with the actual max SR number in the DB.
   * This is a self-healing mechanism for when the sequence table is lagging
   * (e.g., first deployment mid-day).
   */
  private async _syncSRSequence(): Promise<void> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    // Get the actual max SR number
    const lastSR = await prisma.sR.findFirst({
      where: { srNumber: { startsWith: `SR-${dateStr}-` } },
      orderBy: { srNumber: 'desc' },
      select: { srNumber: true },
    });

    if (lastSR) {
      const lastSequence = parseInt(lastSR.srNumber.split('-')[2]);
      if (!isNaN(lastSequence)) {
        // Update sequence to match the actual max
        // Next upsert will increment to lastSequence + 1
        await prisma.sRSequence.upsert({
          where: { date: dateStr },
          update: { seq: lastSequence },
          create: { date: dateStr, seq: lastSequence },
        });
      }
    }
  }

  /**
   * SR을 생성합니다.
   */
  async createSR(data: SrCreateData, sessionUser: AuthenticatedUser): Promise<SRCreateResult> {
    ensureCanCreateSR(sessionUser);
    const validated = srCreateSchema.parse(data);

    // 고객사 활성 상태 확인
    const client = await prisma.client.findUnique({ where: { id: validated.clientId } });
    if (!client) {
      throw new NotFoundError('고객사');
    }
    if (!client.isActive) {
      throw new BusinessRuleError(
        `비활성 상태의 고객사(${client.name})에는 SR을 생성할 수 없습니다. ` +
          `고객사 관리자에게 문의하세요.`
      );
    }

    // SR 생성 (트랜잭션으로 SR 번호 생성 및 SR 생성을 원자적으로 수행)
    // Retry loop added for self-healing sequence initialization
    let sr: SR | null = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (!sr && attempts < maxAttempts) {
      attempts++;
      try {
        sr = await prisma.$transaction(async (tx) => {
          const today = new Date();
          const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

          // 시퀀스 테이블을 사용하여 원자적으로 번호 생성 (upsert 사용)
          const sequence = await tx.sRSequence.upsert({
            where: { date: dateStr },
            update: { seq: { increment: 1 } },
            create: { date: dateStr, seq: 1 },
          });

          const srNumber = `SR-${dateStr}-${String(sequence.seq).padStart(4, '0')}`;

          // SR 생성
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
              status: 'REQUESTED',
              // Optimized: Create activity and status history in the same transaction/query
              // This reduces DB round trips and ensures atomicity without separate calls
              activities: {
                create: {
                  userId: sessionUser.id,
                  type: 'CREATED',
                  description: 'SR이 생성되었습니다.',
                },
              },
              statusHistory: {
                create: {
                  previousStatus: null,
                  currentStatus: 'REQUESTED',
                  changedBy: sessionUser.id,
                  changeReason: 'SR 생성',
                },
              },
            },
          });
        });
      } catch (error) {
        // If unique constraint on srNumber, it means sequence is lagging (e.g. fresh deploy mid-day)
        // We need to sync the sequence.
        const isUnique =
          (error instanceof Error && error.message.includes('Unique constraint')) ||
          (error instanceof PrismaClientKnownRequestError && error.code === 'P2002');

        if (isUnique && attempts < maxAttempts) {
          // Sync sequence
          await this._syncSRSequence();
          continue;
        }
        throw error;
      }
    }

    if (!sr) {
      throw new ServiceError('SR 생성에 실패했습니다.', 'SR_CREATION_FAILED');
    }

    const result = await this.getSRDetailsById(sr.id);
    if (!result) {
      throw new ServiceError('SR 생성 후 조회에 실패했습니다.', 'SR_RETRIEVAL_FAILED');
    }

    // 알림 전송 (ADMIN, MANAGER) - 푸시 및 이메일 통합 처리
    backgroundTask(
      prisma.user
        .findMany({
          where: {
            roles: { some: { role: { name: { in: ['ADMIN', 'MANAGER'] } } } },
            isActive: true,
          },
          // Select only necessary fields to optimize query
          select: {
            id: true,
            email: true,
            notificationPreference: true,
          },
        })
        .then((admins) => {
          const promises: Promise<unknown>[] = [];

          // 1. 푸시 알림
          const adminIds = admins.map((u) => u.id);
          if (adminIds.length > 0) {
            promises.push(
              pushService.sendToUsers(adminIds, {
                title: '새로운 SR 등록',
                body: `${result.srNumber}: ${result.title}`,
                url: `/srs/${result.id}`,
                tag: 'sr-created',
              })
            );
          }

          // 2. 이메일 알림
          admins.forEach((admin) => {
            const shouldSend = admin.notificationPreference?.emailSRCreated ?? true;
            if (admin.email && shouldSend) {
              promises.push(
                emailService.sendSRCreated(
                  admin.email,
                  result.srNumber,
                  result.title,
                  result.requester.name,
                  getSRUrl(result.id)
                )
              );
            }
          });

          return Promise.all(promises);
        }),
      `Notifications for ${result.srNumber}`
    );

    // 실시간 이벤트 발행
    emitRealtimeEvent(REALTIME_EVENTS.SR_CREATED, {
      id: result.id,
      srNumber: result.srNumber,
      title: result.title,
      status: result.status,
    });

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
      if (!existingSR) throw new NotFoundError('SR');

      ensureCanUpdateSR(sessionUser, existingSR);

      // 고객사 변경 검증 (REQUESTED 상태에서만 허용)
      if (validated.clientId && validated.clientId !== existingSR.clientId) {
        if (existingSR.status !== 'REQUESTED') {
          throw new BusinessRuleError(
            `SR이 이미 접수된 상태(${existingSR.status})입니다. ` +
              `접수 후에는 고객사를 변경할 수 없습니다. ` +
              `잘못된 고객사로 생성된 경우 SR을 삭제하고 다시 생성하세요.`
          );
        }

        // 새 고객사가 활성 상태인지 확인
        const newClient = await prisma.client.findUnique({ where: { id: validated.clientId } });
        if (!newClient) {
          throw new NotFoundError('변경하려는 고객사');
        }
        if (!newClient.isActive) {
          throw new BusinessRuleError(
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
          throw new BusinessRuleError(transitionResult.message || '유효하지 않은 상태 전환입니다.');
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
          throw new BusinessRuleError(
            `${validated.status} 상태로 전환하려면 다음 필드가 필요합니다: ${missingFields.join(', ')}`
          );
        }
      }

      // 완료/확정 상태에서 담당자 변경 차단
      const assigneeId = validated.assigneeId || validated.assignedToId;
      if (
        (existingSR.status === 'COMPLETED' || existingSR.status === 'CONFIRMED') &&
        assigneeId !== undefined &&
        assigneeId !== existingSR.assigneeId
      ) {
        throw new BusinessRuleError(
          '완료되거나 확정된 SR의 담당자는 변경할 수 없습니다. ' +
            '변경이 필요한 경우 SR을 다시 열어주세요.'
        );
      }

      const updateData: Prisma.SRUncheckedUpdateInput = {};

      // basic fields
      if (validated.title !== undefined) updateData.title = validated.title;
      if (validated.description !== undefined) updateData.description = validated.description;
      if (validated.clientId !== undefined) updateData.clientId = validated.clientId;
      if (validated.priority !== undefined) updateData.priority = validated.priority;
      if (validated.status !== undefined) updateData.status = validated.status;
      if (validated.actualPriority !== undefined)
        updateData.actualPriority = validated.actualPriority;
      if (validated.estimatedHours !== undefined)
        updateData.estimatedHours =
          typeof validated.estimatedHours === 'string'
            ? parseFloat(validated.estimatedHours)
            : validated.estimatedHours;
      if (validated.intakeNotes !== undefined)
        updateData.intakeNotes = validated.intakeNotes || null;
      if (validated.resolutionDescription !== undefined)
        updateData.resolutionDescription = validated.resolutionDescription || null;
      if (validated.rejectionReason !== undefined)
        updateData.rejectionReason = validated.rejectionReason || null;
      if (validated.satisfactionRating !== undefined)
        updateData.satisfactionRating = validated.satisfactionRating || null;
      if (validated.additionalFeedback !== undefined)
        updateData.additionalFeedback = validated.additionalFeedback || null;

      // dates
      if (validated.expectedCompletionDate !== undefined)
        updateData.expectedCompletionDate = validated.expectedCompletionDate
          ? new Date(validated.expectedCompletionDate)
          : null;
      if (validated.dueDate !== undefined)
        updateData.dueDate = validated.dueDate ? new Date(validated.dueDate) : null;
      if (validated.actualCompletionDate !== undefined)
        updateData.actualCompletionDate = validated.actualCompletionDate
          ? new Date(validated.actualCompletionDate)
          : null;
      if (validated.estimatedCompletionDate !== undefined)
        updateData.estimatedCompletionDate = validated.estimatedCompletionDate
          ? new Date(validated.estimatedCompletionDate)
          : null;

      // relations
      if (validated.serviceCategoryId !== undefined) {
        if (validated.serviceCategoryId) updateData.serviceCategoryId = validated.serviceCategoryId;
      }

      if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;

      // priority SLA adjustment - ServiceCategoryService 활용
      if (validated.actualPriority && validated.actualPriority !== existingSR.actualPriority) {
        try {
          const dueDate = await serviceCategoryService.calculateDueDate(
            existingSR.serviceCategoryId,
            validated.actualPriority,
            existingSR.intakeAt || new Date()
          );
          updateData.dueDate = dueDate;
        } catch (error) {
          // 카테고리를 찾지 못해도 SR 업데이트는 계속 진행
          logger.warn('SLA 기한 계산 실패', { categoryId: existingSR.serviceCategoryId });
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
            changeReason:
              validated.changeReason || `상태 변경: ${existingSR.status} → ${validated.status}`,
          },
        };
        if (validated.status === 'COMPLETED' && !updateData.actualCompletionDate) {
          updateData.actualCompletionDate = new Date();
        }
      }

      const assigneeChanged = assigneeId !== undefined && assigneeId !== existingSR.assigneeId;

      // Optimize: Use nested writes for activities to reduce DB round trips
      const activitiesToCreate: Prisma.SRActivityCreateWithoutSrInput[] = [];

      if (statusChanged) {
        activitiesToCreate.push({
          user: { connect: { id: sessionUser.id } },
          type: 'STATUS_CHANGED',
          description: `상태가 ${existingSR.status}에서 ${validated.status}로 변경되었습니다.`,
        });
      }

      if (assigneeChanged) {
        activitiesToCreate.push({
          user: { connect: { id: sessionUser.id } },
          type: 'ASSIGNED',
          description: assigneeId ? '담당자가 할당되었습니다.' : '담당자 할당이 해제되었습니다.',
        });
      }

      if (activitiesToCreate.length > 0) {
        updateData.activities = {
          create: activitiesToCreate,
        };
      }

      // 트랜잭션으로 업데이트 및 활동 로그 생성
      return await prisma.$transaction(async (tx) => {
        // 1. SR 업데이트 (statusHistory 및 activities 포함)
        let updatedSR: SRUpdateResult = existingSR;

        // If there are activities to create but no other fields to update,
        // we still need to run the update to create the activities via nested write.
        // However, updateData will not be empty because if statusChanged or assigneeChanged is true,
        // updateData.status or updateData.assigneeId would be set respectively.
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
                  notificationPreference: true, // 추가
                },
              },
              assignee: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  notificationPreference: true, // 추가
                },
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
                      name: true,
                    },
                  },
                },
              },
            },
          });
        }

        // 2. 알림 발송 (활동 로그 생성은 위에서 nested write로 처리됨)
        if (statusChanged) {
          // 상태 변경 푸시 알림 (요청자에게)
          if (existingSR.requesterId) {
            backgroundTask(
              pushService.sendToUser(existingSR.requesterId, {
                title: 'SR 상태 변경',
                body: `${existingSR.srNumber} 상태가 ${validated.status}로 변경되었습니다.`,
                url: `/srs/${id}`,
                tag: 'sr-status-changed',
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

        // 3. 담당자 변경 알림
        if (assigneeChanged) {
          // 담당자 배정 푸시 알림 (새 담당자에게)
          if (assigneeId) {
            backgroundTask(
              pushService.sendToUser(assigneeId, {
                title: 'SR 담당 배정',
                body: `${existingSR.srNumber} 담당자로 배정되었습니다.`,
                url: `/srs/${id}`,
                tag: 'sr-assigned',
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

        // 실시간 이벤트 발행
        emitRealtimeEvent(REALTIME_EVENTS.SR_UPDATED, {
          id: updatedSR.id,
          srNumber: updatedSR.srNumber,
          title: updatedSR.title,
          status: updatedSR.status,
        });

        return updatedSR;
      });
    } catch (error) {
      const { logger } = await import('@/lib/logger');
      logger.error('SR 업데이트 서비스 오류', error instanceof Error ? error : undefined, {
        srId: id,
      });
      throw error;
    }
  }

  async getSRById(id: string): Promise<SR | null> {
    return prisma.sR.findUnique({ where: { id } });
  }

  async getSRDetailsById(
    id: string,
    options?: { activitiesLimit?: number; commentsLimit?: number }
  ): Promise<SRDetails | null> {
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
          orderBy: { createdAt: 'desc' },
          take: activitiesLimit,
        },
        comments: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: commentsLimit,
        },
        attachments: {
          orderBy: { createdAt: 'desc' },
        },
        statusHistory: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { changedAt: 'desc' },
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
      select: {
        // Scalar fields (Optimized to exclude large text fields like description)
        id: true,
        srNumber: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        completedAt: true,
        clientId: true,
        requesterId: true,
        assigneeId: true,
        serviceCategoryId: true,

        // Relations
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
            // handler relation fetch removed for performance optimization (unused in list view)
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
    }) as unknown as Promise<SRListItem[]>;
  }

  async countSRs(params?: { where?: Prisma.SRWhereInput }): Promise<number> {
    return prisma.sR.count({ where: params?.where });
  }

  async deleteSR(id: string, sessionUser: AuthenticatedUser): Promise<void> {
    const existingSR = await prisma.sR.findUnique({ where: { id } });
    if (!existingSR) throw new NotFoundError('SR');
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

    // 실시간 이벤트 발행
    emitRealtimeEvent(REALTIME_EVENTS.SR_DELETED, {
      id,
      srNumber: existingSR.srNumber,
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
        orderBy: { changedAt: 'desc' },
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

/**
 * SRService 싱글톤 인스턴스
 * 모든 API 라우트에서 이 인스턴스를 재사용합니다.
 */
export const srService = new SRService();
