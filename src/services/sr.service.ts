import { Prisma, SR, SRStatus } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { z } from 'zod';

import { getSRUrl } from '@/lib/app-url';
import { domainEvents } from '@/lib/domain-events';
import { BusinessRuleError, NotFoundError, ServiceError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { ensureCanCreateSR, ensureCanDeleteSR, ensureCanUpdateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { emitRealtimeEvent, REALTIME_EVENTS } from '@/lib/realtime-events';
import { srCreateSchema, srUpdateSchema } from '@/lib/schemas';
import { getRequiredFields, validateTransition } from '@/lib/sr-state-machine';
import { backgroundTask } from '@/lib/wait-until';
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
    const sr = await prisma.$transaction(async (tx) => {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

      // 원자적 시퀀스 채번 (PostgreSQL native upsert)
      const sequences = await tx.$queryRaw<{ seq: number }[]>`
        INSERT INTO "sr_sequences" ("date", "seq")
        VALUES (${dateStr}, 1)
        ON CONFLICT ("date") DO UPDATE
        SET "seq" = "sr_sequences"."seq" + 1
        RETURNING "seq"
      `;

      const sequenceSeq = sequences[0].seq;
      const srNumber = `SR-${dateStr}-${String(sequenceSeq).padStart(4, '0')}`;

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

    if (!sr) {
      throw new ServiceError('SR 생성에 실패했습니다.', 'SR_CREATION_FAILED');
    }

    const result = await this.getSRDetailsById(sr.id);
    if (!result) {
      throw new ServiceError('SR 생성 후 조회에 실패했습니다.', 'SR_RETRIEVAL_FAILED');
    }

    // 도메인 이벤트 발행 (이벤트 리스너에서 푸시 및 이메일 알림 처리)
    domainEvents.emit('sr:created', {
      srId: result.id,
      srNumber: result.srNumber,
      title: result.title,
      requesterId: sessionUser.id,
      requesterName: sessionUser.name || '알 수 없음',
    });

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
          sessionUser.roles,
          existingSR,
          validated
        );

        if (!transitionResult.valid) {
          throw new BusinessRuleError(transitionResult.message || '유효하지 않은 상태 전환입니다.');
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

      // 1. 트랜잭션으로 업데이트 및 활동 로그 생성 (순수 DB 작업만 트랜잭션 내부에서 수행)
      const updatedSR = await prisma.$transaction(async (tx) => {
        let currentSR: SRUpdateResult = existingSR;

        if (Object.keys(updateData).length > 0) {
          currentSR = await tx.sR.update({
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

        return currentSR;
      });

      // 2. DB 트랜잭션 커밋 완료 후 안전하게 외부 사이드 이펙트 이벤트 발행
      if (statusChanged) {
        domainEvents.emit('sr:status_changed', {
          srId: updatedSR.id,
          srNumber: updatedSR.srNumber,
          title: updatedSR.title,
          requesterId: updatedSR.requesterId,
          previousStatus: existingSR.status,
          currentStatus: validated.status!,
        });
      }

      // 담당자 변경 이벤트 발행 (지정 해제 null 상태 포함)
      if (assigneeChanged) {
        domainEvents.emit('sr:assigned', {
          srId: updatedSR.id,
          srNumber: updatedSR.srNumber,
          title: updatedSR.title,
          assigneeId: assigneeId || null,
          assigneeName: assigneeId ? updatedSR.assignee?.name || '알 수 없음' : null,
        });
      }

      // 실시간 이벤트 발행
      emitRealtimeEvent(REALTIME_EVENTS.SR_UPDATED, {
        id: updatedSR.id,
        srNumber: updatedSR.srNumber,
        title: updatedSR.title,
        status: updatedSR.status,
      });

      return updatedSR;
    } catch (error) {
      logger.error('SR 업데이트 서비스 오류', error instanceof Error ? error : undefined, {
        srId: id,
      });
      throw error;
    }
  }

  async getSRById(id: string): Promise<SR | null> {
    return prisma.sR.findUnique({ where: { id } });
  }

  /**
   * SR 상세 정보를 조회합니다.
   * Optimized: Uses explicit selects for related tables (client, serviceCategory)
   * to avoid over-fetching unused fields like descriptions or addresses.
   */
  async getSRDetailsById(
    id: string,
    options?: { activitiesLimit?: number; commentsLimit?: number }
  ): Promise<SRDetails | null> {
    const { activitiesLimit = 20, commentsLimit = 20 } = options || {};

    return prisma.sR.findUnique({
      where: { id },
      include: {
        client: {
          select: { id: true, code: true, name: true },
        },
        requester: {
          select: { id: true, name: true, email: true, image: true },
        },
        assignee: {
          select: { id: true, name: true, email: true, image: true },
        },
        intakeBy: {
          select: { id: true, name: true, email: true, image: true },
        },
        serviceCategory: {
          select: {
            id: true,
            categoryName: true,
            slaHours: true,
            handlerId: true,
          },
        },
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
    }) as unknown as Promise<SRListItem[]>;
  }

  async countSRs(params?: { where?: Prisma.SRWhereInput }): Promise<number> {
    return prisma.sR.count({ where: params?.where });
  }

  async deleteSR(id: string, sessionUser: AuthenticatedUser): Promise<void> {
    const existingSR = await prisma.sR.findUnique({ where: { id } });
    if (!existingSR) throw new NotFoundError('SR');
    ensureCanDeleteSR(sessionUser);

    // SR 삭제 (DB 수준의 onDelete: Cascade 설정으로 연관 데이터 자동 삭제됨)
    await prisma.sR.delete({ where: { id } });

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

  /**
   * SR 활동 내역을 조회합니다. (페이징 지원)
   */
  async getSRActivities(
    srId: string,
    options?: { cursor?: string; limit?: number }
  ): Promise<{
    activities: Array<{
      id: string;
      type: string;
      description: string;
      createdAt: Date;
      user: { id: string; name: string; image: string | null };
    }>;
    nextCursor: string | null;
  }> {
    const limit = options?.limit || 20;
    const cursor = options?.cursor;

    const activities = await prisma.sRActivity.findMany({
      where: { srId },
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    const hasMore = activities.length > limit;
    const items = hasMore ? activities.slice(0, limit) : activities;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { activities: items, nextCursor };
  }

  /**
   * SR 댓글 목록을 조회합니다. (페이징 지원)
   */
  async getSRComments(
    srId: string,
    options?: { cursor?: string; limit?: number }
  ): Promise<{
    comments: Array<{
      id: string;
      content: string;
      createdAt: Date;
      updatedAt: Date;
      user: { id: string; name: string; image: string | null };
    }>;
    nextCursor: string | null;
  }> {
    const limit = options?.limit || 20;
    const cursor = options?.cursor;

    const comments = await prisma.sRComment.findMany({
      where: { srId },
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { comments: items, nextCursor };
  }
}

/**
 * SRService 싱글톤 인스턴스
 * 모든 API 라우트에서 이 인스턴스를 재사용합니다.
 */
export const srService = new SRService();
