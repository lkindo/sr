import { Prisma, SR, SRStatus } from '@prisma/client';
import { z } from 'zod';

import { PAGINATION } from '@/lib/constants';
import { statusLabelOf } from '@/lib/constants/sr';
import { domainEvents } from '@/lib/domain-events';
import {
  BadRequestError,
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  mapPrismaError,
  NotFoundError,
  ServiceError,
} from '@/lib/errors';
import { logger } from '@/lib/logger';
import { hasPermissionFlag } from '@/lib/permission-helpers';
import {
  ensureCanCreateSR,
  ensureCanDeleteSR,
  ensureCanUpdateSR,
  isInternalUser,
} from '@/lib/policies';
import prisma from '@/lib/prisma';
import { CLIENT_SUMMARY_SELECT, SR_ALIVE, USER_SUMMARY_SELECT } from '@/lib/prisma-selects';
import { emitRealtimeEvent, REALTIME_EVENTS } from '@/lib/realtime-events';
import { srCreateSchema, srUpdateSchema } from '@/lib/schemas';
import { isReopenTransition, validateTransition } from '@/lib/sr-state-machine';
import { appZoneDateStamp } from '@/lib/timezone';
import { auditService } from '@/services/audit.service';
import { serviceCategoryService } from '@/services/service-category.service';
import {
  enqueueSRAssignedEmail,
  enqueueSRCreatedEmails,
  enqueueSRStatusChangedEmail,
} from '@/services/sr-email-outbox';
import { UserService } from '@/services/user.service';
import { AuthenticatedUser } from '@/types/session';
import {
  SRBadgeCounts,
  SRCreateResult,
  SRDetails,
  SRListItem,
  SRUpdateResult,
} from '@/types/sr.types';

type SrUpdateData = z.infer<typeof srUpdateSchema>;
type SrCreateData = z.infer<typeof srCreateSchema>;

/**
 * SR 담당자 할당 권한 키.
 * prisma/seed.ts 에 실제로 시딩된 권한(SR/ASSIGN)만 사용한다.
 * (시딩되지 않은 권한명을 쓰면 아무도 보유할 수 없어 ADMIN 까지 조용히 차단된다.)
 */
const SR_ASSIGN_PERMISSION = 'SR:ASSIGN';

/**
 * 접수(트리아지) 결과에 해당하는 운영 전용 필드를 수정할 수 있는지 판정한다.
 * 내부 사용자(ADMIN/MANAGER/ENGINEER) 또는 SR:ASSIGN 권한 보유자만 허용한다.
 * (전용 intake 라우트가 같은 필드를 운영팀으로 제한하는 것과 동일한 취지)
 */
function canWriteOperatorOwnedFields(user: AuthenticatedUser): boolean {
  return isInternalUser(user) || hasPermissionFlag(user, SR_ASSIGN_PERMISSION);
}

/** 날짜 값(문자열/Date/null)을 비교 가능한 밀리초로 정규화한다. 값이 없으면 null. */
function toTimestampOrNull(value: string | Date | null | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** 숫자 값(number/Decimal/문자열/null)을 비교 가능한 숫자로 정규화한다. 값이 없으면 null. */
function toNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value));
  return Number.isNaN(num) ? null : num;
}

/** 빈 문자열/undefined 를 null 로 정규화한다. (스키마의 emptyStringToNull 과 동일한 기준) */
function toStringOrNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  return value;
}

/**
 * 커서 페이지네이션 공통부.
 *
 * `take: limit + 1` 로 한 건 더 읽어 다음 페이지 존재 여부를 판단하고, 그 여분은 잘라낸다.
 * 커서가 있으면 `skip: 1` 로 커서 행 자신을 건너뛴다 — 빠뜨리면 매 페이지마다 이전
 * 페이지의 마지막 행이 한 번 더 나온다.
 *
 * 활동 내역과 댓글이 같은 규칙을 각자 복제하고 있었다. 한쪽만 고치면 두 목록의
 * 페이징이 조용히 어긋난다.
 */
async function cursorPage<T extends { id: string }>(
  fetchPage: (args: { take: number; skip?: number; cursor?: { id: string } }) => Promise<T[]>,
  options?: { cursor?: string; limit?: number }
): Promise<{ items: T[]; nextCursor: string | null }> {
  const requestedLimit = options?.limit;
  const limit =
    Number.isInteger(requestedLimit) && (requestedLimit as number) > 0
      ? Math.min(requestedLimit as number, PAGINATION.MAX_PAGE_SIZE)
      : PAGINATION.DEFAULT_LIMIT;
  const cursor = options?.cursor;

  const rows = await fetchPage({
    take: limit + 1,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

/**
 * 담당자로 배정 가능한 사용자인지 검증하고, 검증된 사용자 정보를 반환한다.
 *
 * - 존재하지 않으면 NotFoundError (원시 FK 위반이 500 으로 새는 것을 방지)
 * - 비활성 사용자면 BadRequestError. 비활성 담당자에게 SR 이 남으면 로그인할 수 없는
 *   담당자에게 묶인 orphan SR 이 되고, 그 사용자는 이후 정상적으로 비활성화할 수도 없다.
 *   (user.service.ts deactivateUser 가 진행 중 SR 보유자를 차단하며, 그 안전성이
 *    "배정 경로의 isActive 가드"에 의존한다고 주석에 명시되어 있다.)
 * - SR 처리 자격이 없으면 BadRequestError. 판정 기준은 담당자 선택 목록과 동일한
 *   getUsersWithSRHandlingPermission(내부 역할 + 담당자 필수 권한)을 재사용한다.
 *   → 드롭다운에 보이지 않는 사용자는 어떤 경로로도 담당자가 될 수 없다.
 *
 * 세 곳의 배정 경로(updateSR · intake PATCH · intake POST)가 모두 이 함수를 호출한다.
 */
export async function assertAssignable(
  assigneeId: string,
  userService: UserService = new UserService()
): Promise<{ id: string; name: string; email: string }> {
  const candidate = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { id: true, name: true, email: true, isActive: true },
  });

  if (!candidate) {
    throw new NotFoundError('담당자');
  }

  if (!candidate.isActive) {
    throw new BadRequestError('비활성 상태의 사용자에게는 담당자를 배정할 수 없습니다.');
  }

  const handlers = await userService.getUsersWithSRHandlingPermission();
  if (!handlers.some((handler) => handler.id === assigneeId)) {
    throw new BadRequestError('SR 처리 권한이 없는 사용자는 담당자로 배정할 수 없습니다.');
  }

  return { id: candidate.id, name: candidate.name, email: candidate.email };
}

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
      // KST 달력 기준. `toISOString()` 이면 09:00 KST 에 날짜가 롤오버해서
      // 하루의 앞 9시간에 만든 SR 이 전날 번호를 받는다(감사 3.25).
      const dateStr = appZoneDateStamp();

      // 원자적 시퀀스 채번 (PostgreSQL native upsert)
      const sequences = await tx.$queryRaw<{ seq: number }[]>`
        INSERT INTO "sr_sequences" ("date", "seq")
        VALUES (${dateStr}, 1)
        ON CONFLICT ("date") DO UPDATE
        SET "seq" = "sr_sequences"."seq" + 1
        RETURNING "seq"
      `;

      // RETURNING 이 있는 INSERT ... ON CONFLICT DO UPDATE 는 정상 경로에서 반드시 한 행을
      // 돌려주지만, 타입은 그것을 보장하지 않는다. 빈 배열을 그냥 인덱싱하면
      // `undefined.seq` 로 죽으면서 원인을 알 수 없는 500 이 되므로, 무슨 일이 있었는지
      // 말해 주는 오류로 바꾼다(트랜잭션은 어차피 롤백된다).
      const sequenceSeq = sequences[0]?.seq;
      if (sequenceSeq === undefined) {
        throw new Error(`SR 번호 채번에 실패했습니다. (date=${dateStr})`);
      }
      const srNumber = `SR-${dateStr}-${String(sequenceSeq).padStart(4, '0')}`;

      // SR 생성
      const created = await tx.sR.create({
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

      await enqueueSRCreatedEmails(tx, {
        srId: created.id,
        srNumber: created.srNumber,
        title: created.title,
        requesterName: sessionUser.name || '알 수 없음',
      });

      return created;
    });

    if (!sr) {
      throw new ServiceError('SR 생성에 실패했습니다.', 'SR_CREATION_FAILED');
    }

    const result = await this.getSRDetailsById(sr.id, { viewer: sessionUser });
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
      const existingSR = await prisma.sR.findUnique({ where: { id, ...SR_ALIVE } });
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
          validated,
          sessionUser.permissions,
          // 신청자 본인만 가능한 전이(CONFIRMED)를 판정하려면 행위자 ID 가 필요하다.
          // 이것이 없으면 상태 머신은 fail-closed 로 거부한다.
          sessionUser.id
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

      // 필드 단위 인가(규칙 본문은 collectOperatorFieldChanges 주석 참조).
      // REST 라우트(PATCH /api/srs/[id])와 Server Action(updateSRAction)이 모두 이 지점을
      // 지나므로 규칙은 여기 한 곳에만 둔다.
      const operatorFieldChanges = this.collectOperatorFieldChanges(
        validated,
        existingSR,
        assigneeId
      );

      if (operatorFieldChanges.length > 0 && !canWriteOperatorOwnedFields(sessionUser)) {
        throw new ForbiddenError(
          `접수 담당자만 변경할 수 있는 항목입니다: ${operatorFieldChanges.join(', ')}. ` +
            `변경이 필요한 경우 담당자에게 요청하세요.`
        );
      }

      // 담당자 유효성 검증: 존재하지 않거나 비활성이거나 SR 처리 권한이 없는 사용자는 거부한다.
      // (배정 해제(null)는 검증 대상이 아니다.)
      if (assigneeId && assigneeId !== existingSR.assigneeId) {
        await assertAssignable(assigneeId);
      }

      const { updateData, statusChanged, assigneeChanged, dueDateManuallySet } =
        await this.buildSRUpdateData(validated, existingSR, sessionUser, assigneeId);

      // 1. 트랜잭션으로 업데이트 및 활동 로그 생성 (순수 DB 작업만 트랜잭션 내부에서 수행)
      const updatedSR = await prisma.$transaction(async (tx) => {
        let currentSR: SRUpdateResult = existingSR;

        if (Object.keys(updateData).length > 0) {
          // 낙관적 동시성 제어:
          // 스냅샷(existingSR)을 읽은 이후 어떤 필드라도 변경되지 않았을 때만 갱신을 허용한다.
          // 상태만 비교하면 같은 상태 안에서 일어난 제목/담당자/기한 수정은 감지하지 못한다.
          // 모든 SR 쓰기가 증가시키는 version 을 비교해 lost update 와 불법 상태 전이를 막는다.
          // (이 updateMany 는 행 잠금을 획득하므로 이어지는 update 도 일관성이 보장된다.)
          const guard = await tx.sR.updateMany({
            where: { id, version: existingSR.version },
            data: { version: { increment: 1 } },
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
              client: { select: CLIENT_SUMMARY_SELECT },
              requester: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  notificationPreference: true,
                },
              },
              assignee: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  notificationPreference: true,
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

          /**
           * 마감일 수동 조정은 감사 로그를 남긴다 (헌법 §3).
           *
           * 마감일은 원칙적으로 자동 산출값이다. 사람이 그것을 덮어쓰는 것은 SLA 근거를
           * 바꾸는 행위이므로 "누가 · 언제 · 무엇에서 무엇으로 · 왜" 가 남아야 한다.
           * 남기지 않으면 준수율이 왜 그 값인지 사후에 설명할 수 없다.
           */
          if (dueDateManuallySet) {
            await auditService.createLog(tx, {
              userId: sessionUser.id,
              actionType: 'UPDATE',
              targetEntity: 'SR_DUE_DATE',
              targetId: id,
              changes: {
                srNumber: existingSR.srNumber,
                before: existingSR.dueDate?.toISOString() ?? null,
                after: currentSR.dueDate?.toISOString() ?? null,
                reason: validated.changeReason ?? null,
              },
            });
          }

          if (statusChanged) {
            await enqueueSRStatusChangedEmail(tx, {
              srId: currentSR.id,
              srNumber: currentSR.srNumber,
              title: currentSR.title,
              requesterId: currentSR.requesterId,
              previousStatus: existingSR.status,
              currentStatus: validated.status!,
              // 갱신 후 값을 쓴다. 이번 전이에서 들어온 사유가 아직 updateData 에만 있고
              // existingSR 에는 없을 수 있다.
              resolutionDescription: currentSR.resolutionDescription,
              rejectionReason: currentSR.rejectionReason,
            });
          }
          if (assigneeChanged && assigneeId) {
            await enqueueSRAssignedEmail(tx, {
              srId: currentSR.id,
              srNumber: currentSR.srNumber,
              title: currentSR.title,
              assigneeId,
              assigneeName: currentSR.assignee?.name || '알 수 없음',
            });
          }
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
      // 원시 Prisma 제약 위반(P2003 등)은 도메인 에러로 정규화해 400 으로 내린다.
      // (잘못된 참조 ID 가 500 으로 노출되는 것을 방지)
      throw mapPrismaError(error) ?? error;
    }
  }

  /**
   * 필드 단위 인가: 접수(트리아지) 결과는 운영팀이 소유한다.
   *
   * ensureCanUpdateSR 는 "이 SR 을 수정할 수 있는가"만 판정하므로, SR:UPDATE 를 가진
   * 고객사 관리자(CLIENT_ADMIN)나 SR:UPDATE_SELF 를 가진 요청자 본인도 통과한다.
   * 그 상태에서 dueDate/actualPriority/estimatedHours/estimatedCompletionDate/
   * intakeNotes/assigneeId 까지
   * 그대로 기록하면 SLA 기한과 실제 우선순위를 스스로 고쳐 SLA 준수율 지표를 위조하고
   * 담당 엔지니어를 조용히 재배정할 수 있다. (전용 intake PATCH 라우트는 같은 필드를
   * ADMIN/MANAGER 로 제한하고 있으므로 동일한 취지를 서비스 계층에 둔다.)
   *
   * 값이 실제로 바뀌는 경우에만 차단한다. 수정 다이얼로그가 전체 객체를 다시 전송하는
   * 형태여도 동일 값 재전송은 no-op 으로 통과시켜야 정상 편집이 깨지지 않는다.
   * (users/[id] 라우트에서 채택한 "변경 시도만 거부" 방식과 동일)
   *
   * @returns 운영팀 소유 필드 중 값이 실제로 바뀌는 필드명 목록
   */
  private collectOperatorFieldChanges(
    validated: z.infer<typeof srUpdateSchema>,
    existingSR: SR,
    assigneeId?: string | null
  ): string[] {
    const operatorFieldChanges: string[] = [];
    if (
      validated.dueDate !== undefined &&
      toTimestampOrNull(validated.dueDate) !== toTimestampOrNull(existingSR.dueDate)
    ) {
      operatorFieldChanges.push('dueDate');
    }
    if (
      validated.actualPriority !== undefined &&
      validated.actualPriority !== existingSR.actualPriority
    ) {
      operatorFieldChanges.push('actualPriority');
    }
    if (
      validated.estimatedHours !== undefined &&
      toNumberOrNull(validated.estimatedHours) !== toNumberOrNull(existingSR.estimatedHours)
    ) {
      operatorFieldChanges.push('estimatedHours');
    }
    if (
      validated.intakeNotes !== undefined &&
      toStringOrNull(validated.intakeNotes) !== toStringOrNull(existingSR.intakeNotes)
    ) {
      operatorFieldChanges.push('intakeNotes');
    }
    // estimatedCompletionDate(예상 완료일)도 접수 산출물이다. intake PATCH 라우트가
    // actualPriority/estimatedHours/estimatedCompletionDate/intakeNotes/assigneeId 를 모두
    // ADMIN/MANAGER 로 제한하고 있으므로 동일하게 운영 소유 필드로 취급한다.
    // (SR 수정 다이얼로그는 이 필드를 전송하지 않으므로 일반 편집 경로는 영향받지 않는다.)
    if (
      validated.estimatedCompletionDate !== undefined &&
      toTimestampOrNull(validated.estimatedCompletionDate) !==
        toTimestampOrNull(existingSR.estimatedCompletionDate)
    ) {
      operatorFieldChanges.push('estimatedCompletionDate');
    }
    // 서비스 카테고리는 **SLA 산정 근거**다(slaHours × 우선순위 배율 — 헌법 §3).
    // 요청자가 자유롭게 바꿀 수 있으면 마감일을 사실상 스스로 정하게 된다.
    if (
      validated.serviceCategoryId !== undefined &&
      toStringOrNull(validated.serviceCategoryId) !== toStringOrNull(existingSR.serviceCategoryId)
    ) {
      operatorFieldChanges.push('serviceCategoryId');
    }
    if (
      assigneeId !== undefined &&
      toStringOrNull(assigneeId) !== toStringOrNull(existingSR.assigneeId)
    ) {
      operatorFieldChanges.push('assigneeId');
    }
    return operatorFieldChanges;
  }

  /**
   * 검증된 입력으로 Prisma 업데이트 페이로드를 조립한다.
   *
   * SLA 기한 재계산(serviceCategoryService.calculateDueDate)과 카테고리 테넌트 검증에
   * I/O 가 있으므로 async 다. statusChanged/assigneeChanged 를 함께 반환하는 이유는
   * 트랜잭션 커밋 이후의 이벤트 발행부가 같은 판정을 재계산 없이 소비해야 하기 때문이다.
   */
  private async buildSRUpdateData(
    validated: z.infer<typeof srUpdateSchema>,
    existingSR: SR,
    sessionUser: AuthenticatedUser,
    assigneeId?: string | null
  ): Promise<{
    updateData: Prisma.SRUncheckedUpdateInput;
    statusChanged: boolean;
    assigneeChanged: boolean;
    /** 사람이 마감일을 직접 지정했는가. 감사 로그를 남길지 판정하는 데 쓴다(헌법 §3). */
    dueDateManuallySet: boolean;
  }> {
    const updateData: Prisma.SRUncheckedUpdateInput = {};

    // basic fields
    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.clientId !== undefined) updateData.clientId = validated.clientId;
    if (validated.priority !== undefined) updateData.priority = validated.priority;
    if (validated.status !== undefined) updateData.status = validated.status;

    // 요청자가 표명한 희망 긴급도·기한. 운영자 소유 필드가 아니므로 게이트하지 않는다.
    // (스키마에 선언이 없어 zod 가 조용히 버리던 값들 — 감사 3.27)
    if (validated.requestedPriority !== undefined)
      updateData.requestedPriority = validated.requestedPriority;
    if (validated.requestedCompletionDate !== undefined)
      updateData.requestedCompletionDate = validated.requestedCompletionDate
        ? new Date(validated.requestedCompletionDate)
        : null;
    if (validated.actualPriority !== undefined)
      updateData.actualPriority = validated.actualPriority;
    if (validated.estimatedHours !== undefined)
      updateData.estimatedHours =
        typeof validated.estimatedHours === 'string'
          ? parseFloat(validated.estimatedHours)
          : validated.estimatedHours;
    if (validated.intakeNotes !== undefined) updateData.intakeNotes = validated.intakeNotes || null;
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
    if (validated.expectedHoldReleaseDate !== undefined)
      updateData.expectedHoldReleaseDate = validated.expectedHoldReleaseDate
        ? new Date(validated.expectedHoldReleaseDate)
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

    // SLA 마감일 재산출 (헌법 §3).
    //
    // 두 가지가 마감일을 움직인다: **실제 우선순위**(배율)와 **서비스 카테고리**(기준 시간).
    // 예전에는 우선순위 변경만 트리거였고, 재산출조차 `existingSR.serviceCategoryId` 즉
    // **변경 전** 카테고리로 계산했다. 그래서 "일반 문의(72h) → 장애(24h)" 로 바꾸면서
    // 우선순위를 CRITICAL 로 올리면 기대 12시간 대신 36시간(72×0.5)이 저장됐다.
    // 화면이 보여 주는 SLA 근거와 저장된 마감일이 어긋나는 상태다.
    const nextCategoryId = validated.serviceCategoryId || existingSR.serviceCategoryId;
    const nextPriority = validated.actualPriority ?? existingSR.actualPriority;
    const priorityChanged =
      validated.actualPriority !== undefined &&
      validated.actualPriority !== existingSR.actualPriority;
    const categoryChanged = nextCategoryId !== existingSR.serviceCategoryId;

    // 운영자가 마감일을 직접 지정했다면 그 값을 자동 산출로 덮어쓰지 않는다(헌법 §3).
    const dueDateManuallySet = validated.dueDate !== undefined;

    if ((priorityChanged || categoryChanged) && nextPriority && !dueDateManuallySet) {
      try {
        updateData.dueDate = await serviceCategoryService.calculateDueDate(
          nextCategoryId,
          nextPriority,
          existingSR.intakeAt || new Date()
        );
      } catch {
        // 카테고리를 찾지 못해도 SR 업데이트는 계속 진행
        logger.warn('SLA 기한 계산 실패', { categoryId: nextCategoryId });
      }
    }

    // 상태 변경 처리: statusHistory를 updateData에 포함
    const statusChanged = validated.status !== undefined && validated.status !== existingSR.status;
    if (statusChanged) {
      updateData.statusHistory = {
        create: {
          previousStatus: existingSR.status,
          currentStatus: validated.status!,
          changedBy: sessionUser.id,
          changeReason:
            validated.changeReason ||
            `상태 변경: ${statusLabelOf(existingSR.status)} → ${statusLabelOf(validated.status!)}`,
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
      // 재오픈은 겉으로는 IN_PROGRESS 로의 평범한 전이지만 의미가 다르다 — 재작업이다.
      // 헌법 §2 가 `SRActivityType.REOPENED` 이력을 남기라고 규정하는데도 예전에는
      // 전부 STATUS_CHANGED 로만 남아, 활동 로그에서 재오픈을 골라낼 수 없었다.
      const reopened = isReopenTransition(existingSR.status, validated.status!);
      activitiesToCreate.push({
        user: { connect: { id: sessionUser.id } },
        type: reopened ? 'REOPENED' : 'STATUS_CHANGED',
        description: reopened
          ? `${statusLabelOf(existingSR.status)} 상태에서 재오픈되었습니다.`
          : `상태가 ${statusLabelOf(existingSR.status)}에서 ${statusLabelOf(validated.status!)}(으)로 변경되었습니다.`,
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

    return { updateData, statusChanged, assigneeChanged, dueDateManuallySet };
  }

  async getSRById(id: string): Promise<SR | null> {
    return prisma.sR.findUnique({ where: { id, ...SR_ALIVE } });
  }

  /**
   * SR 상세 정보를 조회합니다.
   * Optimized: Uses explicit selects for related tables (client, serviceCategory)
   * to avoid over-fetching unused fields like descriptions or addresses.
   */
  async getSRDetailsById(
    id: string,
    options?: {
      activitiesLimit?: number;
      commentsLimit?: number;
      attachmentsLimit?: number;
      statusHistoryLimit?: number;
      viewer?: AuthenticatedUser;
    }
  ): Promise<SRDetails | null> {
    const boundedLimit = (value: number | undefined, fallback: number) =>
      Number.isInteger(value) && (value as number) > 0
        ? Math.min(value as number, PAGINATION.MAX_PAGE_SIZE)
        : fallback;
    const activitiesLimit = boundedLimit(options?.activitiesLimit, PAGINATION.DEFAULT_LIMIT);
    const commentsLimit = boundedLimit(options?.commentsLimit, PAGINATION.DEFAULT_LIMIT);
    const attachmentsLimit = boundedLimit(options?.attachmentsLimit, 50);
    const statusHistoryLimit = boundedLimit(options?.statusHistoryLimit, 50);
    // 호출자가 뷰어를 빠뜨리면 외부 사용자 기준으로 닫힌다(fail closed).
    const canReadInternalComments = options?.viewer ? isInternalUser(options.viewer) : false;
    const visibleCommentWhere = canReadInternalComments ? {} : { isInternal: false };

    return prisma.sR.findUnique({
      where: { id, ...SR_ALIVE },
      include: {
        client: {
          select: CLIENT_SUMMARY_SELECT,
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
          where: visibleCommentWhere,
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: commentsLimit,
        },
        attachments: {
          select: {
            id: true,
            srId: true,
            fileName: true,
            fileSize: true,
            fileType: true,
            fileUrl: true,
            uploadedBy: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: attachmentsLimit,
        },
        statusHistory: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { changedAt: 'desc' },
          take: statusHistoryLimit,
        },
        _count: {
          select: {
            comments: { where: visibleCommentWhere },
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
      where: { ...SR_ALIVE, ...where },
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
        requester: { select: USER_SUMMARY_SELECT },
        assignee: { select: USER_SUMMARY_SELECT },
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
    return prisma.sR.count({ where: { ...SR_ALIVE, ...params?.where } });
  }

  /**
   * `/srs` 상단 배지 5종을 **한 번의 쿼리**로 집계한다(이슈 #249).
   *
   * 예전에는 `countSRs` 를 다섯 번 불렀다. 다섯 호출은 술어만 다를 뿐 **같은 행 집합을
   * 다섯 번 스캔**했고, SR 이 늘수록 선형으로 나빠졌다. 목록 조회 1회 + 카운트 6회가
   * 페이지 로드마다 붙던 것을 목록 1회 + 카운트 2회로 줄인다
   * (남은 하나는 필터가 적용된 페이지네이션 총계라 술어가 다르다).
   *
   * **테넌트 경계가 이 메서드의 핵심 계약이다.** 배지는 필터와 무관하게 "내가 볼 수 있는
   * 전체"를 세므로, 여기서 스코프 술어가 빠지면 다른 고객사의 SR 개수가 그대로 새어
   * 나간다. 그래서 스코프를 옵셔널로 두지 않고 `clientIds` 를 **필수 인자**로 받는다 —
   * 전 테넌트 조회는 `null` 을 명시해야만 가능하다. 깜빡해서 열리는 일이 없도록.
   *
   * 생 SQL 을 쓰지만 값은 전부 `Prisma.sql` 태그드 템플릿으로 바인딩한다. 문자열을
   * 이어 붙이면 테넌트 술어 자리가 그대로 주입 표면이 된다.
   *
   * 마감일 경계(`dueFrom`/`dueTo`)는 호출자가 계산해 넘긴다. SQL 안에서 `now()` 로
   * 구하면 DB 세션의 시간대에 따라 KST 자정이 아닌 곳에서 날짜가 롤오버한다.
   */
  async getSRBadgeCounts(params: {
    /** 스코프할 고객사 ID. `null` 이면 전 테넌트(내부 사용자)를 뜻한다. */
    clientIds: string[] | null;
    /** 오늘 시작(포함) — 앱 시간대 기준으로 호출자가 계산한다. */
    dueFrom: Date;
    /** 내일 시작(제외). */
    dueTo: Date;
    /** "내 담당" 배지 기준 사용자. */
    assigneeId: string;
    /** ENGINEER 목록 정책과 동일하게 전체 배지 집계를 제한할 담당자. */
    visibilityAssigneeId?: string;
  }): Promise<SRBadgeCounts> {
    // 빈 배열은 `= ANY('{}')` 가 항상 거짓이라 "아무것도 못 봄"이 된다.
    // 소속 고객사가 없는 외부 사용자에게 정확히 그 동작이어야 한다(fail-closed).
    const tenantScope =
      params.clientIds === null
        ? Prisma.sql`TRUE`
        : Prisma.sql`client_id = ANY(${params.clientIds}::text[])`;
    const assigneeScope = params.visibilityAssigneeId
      ? Prisma.sql`AND assignee_id = ${params.visibilityAssigneeId}`
      : Prisma.empty;

    // COUNT 는 bigint 를 돌려주고 Prisma 는 그걸 BigInt 로 매핑한다.
    // JSON 직렬화가 불가능해 서버 컴포넌트 경계를 넘지 못하므로 SQL 에서 int 로 내린다.
    const [row] = await prisma.$queryRaw<Array<Record<keyof SRBadgeCounts, number>>>`SELECT
        COUNT(*) FILTER (WHERE status = 'REQUESTED')::int                      AS "waiting",
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int                    AS "inProgress",
        COUNT(*) FILTER (WHERE priority IN ('CRITICAL', 'HIGH'))::int          AS "urgent",
        COUNT(*) FILTER (WHERE due_date >= ${params.dueFrom}
                           AND due_date <  ${params.dueTo}
                           AND status IN ('INTAKE', 'IN_PROGRESS', 'ON_HOLD'))::int AS "dueToday",
        COUNT(*) FILTER (WHERE assignee_id = ${params.assigneeId})::int        AS "myAssigned"
      FROM srs
      -- soft delete 제외(db-rules §2). $queryRaw 는 SR_ALIVE 가 닿지 않는다.
      WHERE deleted_at IS NULL AND ${tenantScope}
      ${assigneeScope}`;

    // 집계 쿼리는 행이 없어도 한 줄을 돌려주지만, 방어적으로 0 을 채운다.
    return {
      waiting: row?.waiting ?? 0,
      inProgress: row?.inProgress ?? 0,
      urgent: row?.urgent ?? 0,
      dueToday: row?.dueToday ?? 0,
      myAssigned: row?.myAssigned ?? 0,
    };
  }

  /**
   * SR 삭제 — **soft delete 다**(db-rules §2).
   *
   * 예전에는 `tx.sR.delete()` 로 행을 지웠다. 그런데 sr_activities / sr_comments /
   * sr_attachments / sr_status_history 가 전부 `onDelete: Cascade` 라, 삭제 한 번에
   * 처리 이력·고객 댓글·첨부·상태 이력이 복구 불가하게 사라졌다. 감사 로그에 남는 것은
   * `{id, title, srNumber}` 세 필드뿐이라 분쟁 시 사후 규명이 불가능했다.
   *
   * 첨부 blob 도 지우지 않는다 — 행이 살아 있으므로 경로를 잃지 않고, 보존 기간이 지난 뒤
   * 배치가 정리하면 된다. 되돌릴 수 없는 작업을 사용자 요청 시점에 하지 않는 것이 핵심이다.
   */
  async deleteSR(id: string, sessionUser: AuthenticatedUser): Promise<void> {
    const existingSR = await prisma.sR.findUnique({ where: { id, ...SR_ALIVE } });
    if (!existingSR) throw new NotFoundError('SR');
    // 테넌트 술어를 포함한다 — 예전에는 `existingSR` 을 가져와 놓고 인가에 쓰지 않아
    // `SR:DELETE` 보유자가 남의 테넌트 SR 을 지울 수 있었다(감사 4.1).
    ensureCanDeleteSR(sessionUser, existingSR);

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

      // 2. SR 삭제 표시 — 감사 로그와 반드시 같은 트랜잭션에서 수행한다.
      //    (테스트 목이 불완전하다는 이유로 prisma 로 폴백하면 삭제가 트랜잭션 밖으로
      //     새어나가 원자성이 깨진다. 목 쪽을 고칠 일이다.)
      //    `updateMany` + `deletedAt: null` 조건이라 동시에 두 번 눌러도 두 번째는 0건이다.
      await tx.sR.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });

    // 첨부 blob 은 지우지 않는다. 행이 살아 있으므로 경로를 잃지 않으며, 되돌릴 수 없는
    // 파일 삭제는 보존 기간이 지난 뒤 정리 배치가 맡는다.

    // 실시간 이벤트 발행 — 화면에서는 삭제와 동일하게 사라져야 한다.
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
    const { items, nextCursor } = await cursorPage(
      (page) =>
        prisma.sRActivity.findMany({
          ...page,
          where: { srId },
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, image: true } } },
        }),
      options
    );

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
    const { items, nextCursor } = await cursorPage(
      (page) =>
        prisma.sRComment.findMany({
          ...page,
          where: { srId },
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, image: true } } },
        }),
      options
    );

    return { comments: items, nextCursor };
  }
}

/**
 * SRService 싱글톤 인스턴스
 * 모든 API 라우트에서 이 인스턴스를 재사용합니다.
 */
export const srService = new SRService();
