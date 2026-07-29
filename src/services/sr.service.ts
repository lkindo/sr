import { Prisma, SR, SRStatus } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { z } from 'zod';

import { getSRUrl } from '@/lib/app-url';
import { domainEvents } from '@/lib/domain-events';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceError,
} from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  ensureCanCreateSR,
  ensureCanDeleteSR,
  ensureCanUpdateSR,
  isInternalUser,
} from '@/lib/policies';
import prisma from '@/lib/prisma';
import { emitRealtimeEvent, REALTIME_EVENTS } from '@/lib/realtime-events';
import { srCreateSchema, srUpdateSchema } from '@/lib/schemas';
import { getRequiredFields, validateTransition } from '@/lib/sr-state-machine';
import { auditService } from '@/services/audit.service';
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
   * 서비스 카테고리가 해당 고객사에서 사용 가능한지 검증합니다.
   * 전역 카테고리(clientId = null)이거나 해당 고객사 전용 카테고리만 허용합니다.
   */
  private async ensureCategoryBelongsToClient(
    serviceCategoryId: string | null | undefined,
    clientId: string
  ): Promise<void> {
    if (!serviceCategoryId) return;

    const category = await prisma.serviceCategory.findUnique({
      where: { id: serviceCategoryId },
      select: { clientId: true },
    });
    if (category && category.clientId && category.clientId !== clientId) {
      throw new ForbiddenError('다른 고객사의 서비스 카테고리는 사용할 수 없습니다.');
    }
  }

  /**
   * SR을 생성합니다.
   */
  async createSR(data: SrCreateData, sessionUser: AuthenticatedUser): Promise<SRCreateResult> {
    ensureCanCreateSR(sessionUser);
    const validated = srCreateSchema.parse(data);

    // 테넌트 경계 검증: 외부 사용자는 본인이 소속된 고객사로만 SR을 생성할 수 있다.
    // (REST 라우트와 Server Action 이 모두 이 지점을 거치므로 규칙은 여기 한 곳에만 둔다.)
    // 조회보다 먼저 검증해야 타 고객사의 존재 여부/이름이 오류 메시지로 새지 않는다.
    if (
      !isInternalUser(sessionUser) &&
      !(sessionUser.clientIds ?? []).includes(validated.clientId)
    ) {
      throw new ForbiddenError('소속되지 않은 고객사의 SR을 생성할 수 없습니다.');
    }

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

    await this.ensureCategoryBelongsToClient(validated.serviceCategoryId, validated.clientId);

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
      // 권한 필터링용 키: SSE 연결별 테넌트/역할 격리 및 본인 에코(중복 토스트) 방지
      clientId: sr.clientId,
      requesterId: sr.requesterId,
      assigneeId: sr.assigneeId,
      actorId: sessionUser.id,
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

        // 테넌트 경계 검증: 외부 사용자는 본인이 소속된 고객사로만 이관할 수 있다.
        // (검증이 없으면 다른 테넌트의 격리 경계 안으로 SR과 댓글/첨부를 옮길 수 있다.)
        if (
          !isInternalUser(sessionUser) &&
          !(sessionUser.clientIds ?? []).includes(validated.clientId)
        ) {
          throw new ForbiddenError('소속되지 않은 고객사로 SR을 이관할 수 없습니다.');
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
        if (validated.serviceCategoryId) {
          // 생성 경로와 동일한 테넌트 경계를 적용한다.
          // (없으면 타 고객사 카테고리로 바꿔 이름/SLA를 되읽을 수 있다.)
          await this.ensureCategoryBelongsToClient(
            validated.serviceCategoryId,
            validated.clientId ?? existingSR.clientId
          );
          updateData.serviceCategoryId = validated.serviceCategoryId;
        }
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
        // REQUESTED → INTAKE 전이 시 접수 메타데이터를 채운다.
        // (전용 intake 라우트가 아닌 일반 PATCH 로 접수돼도 intakeAt 이 기록되지 않으면
        //  대시보드의 SLA/처리시간 통계 쿼리 조건(intake_at IS NOT NULL)에서 누락되어
        //  통계가 오염된다.)
        if (
          validated.status === 'INTAKE' &&
          existingSR.status === 'REQUESTED' &&
          !existingSR.intakeAt
        ) {
          updateData.intakeAt = new Date();
          updateData.intakeById = sessionUser.id;
        }
        if (validated.status === 'COMPLETED') {
          if (!updateData.actualCompletionDate) {
            updateData.actualCompletionDate = new Date();
          }
          // 재오픈(7일) 창 판정 기준이 되는 completedAt 을 항상 기록
          // (status 라우트뿐 아니라 updateSR 경로로 완료돼도 창 규칙이 동작하도록)
          updateData.completedAt = new Date();
        }
        if (validated.status === 'CONFIRMED') {
          updateData.confirmedAt = new Date();
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
          // 낙관적 동시성 제어:
          // 스냅샷(existingSR)을 읽은 이후 상태가 변경되지 않았을 때만 갱신을 허용한다.
          // updateMany 의 WHERE 에 기대 상태를 포함하면, 동시 전이 시 매칭 0건이 되어
          // lost update / 불법 상태 전이 / 이중 처리를 방지한다.
          // (이 updateMany 는 행 잠금을 획득하므로 이어지는 update 도 일관성이 보장된다.)
          const guard = await tx.sR.updateMany({
            where: { id, status: existingSR.status },
            data: { updatedAt: new Date() },
          });
          if (guard.count === 0) {
            throw new ConflictError(
              '다른 사용자가 먼저 이 SR을 변경했습니다. 새로고침 후 다시 시도해주세요.'
            );
          }

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
        // 권한 필터링용 키: SSE 연결별 테넌트/역할 격리 및 본인 에코(중복 토스트) 방지
        clientId: updatedSR.clientId,
        requesterId: updatedSR.requesterId,
        assigneeId: updatedSR.assigneeId,
        actorId: sessionUser.id,
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

    // 트랜잭션으로 감사 로그 적재 및 SR 삭제 원자적 실행
    await prisma.$transaction(async (tx) => {
      // 1. 감사 로그 적재
      await auditService.createLog(tx, {
        userId: sessionUser.id,
        actionType: 'DELETE',
        targetEntity: 'SR',
        targetId: id,
        changes: { id, title: existingSR.title, srNumber: existingSR.srNumber },
      });

      // 2. SR 삭제 (테스트 모킹 환경을 고려한 안전 폴백 적용)
      const deleteClient =
        tx && 'sR' in tx && typeof (tx as any).sR.delete === 'function' ? tx : prisma;
      await deleteClient.sR.delete({ where: { id } });
    });

    // 실시간 이벤트 발행
    emitRealtimeEvent(REALTIME_EVENTS.SR_DELETED, {
      id,
      srNumber: existingSR.srNumber,
      // 권한 필터링용 키: 삭제 전 스냅샷 기준으로 테넌트/역할 격리 및 본인 에코 방지
      clientId: existingSR.clientId,
      requesterId: existingSR.requesterId,
      assigneeId: existingSR.assigneeId,
      actorId: sessionUser.id,
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
