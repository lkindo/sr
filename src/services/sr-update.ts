import { Prisma, SR } from '@prisma/client';
import { z } from 'zod';

import { statusLabelOf } from '@/lib/constants/sr';
import { ForbiddenError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { srUpdateSchema } from '@/lib/schemas';
import { isReopenTransition } from '@/lib/sr-state-machine';
import { serviceCategoryService } from '@/services/service-category.service';
import { AuthenticatedUser } from '@/types/session';

/**
 * SR 수정 입력의 해석: 값 정규화, 운영자 소유 필드 판별, Prisma 저장 데이터 조립.
 * 수정 흐름과 권한 판정의 순서는 SRService.updateSR 에 있다.
 */

/** 날짜 값(문자열/Date/null)을 비교 가능한 밀리초로 정규화한다. 값이 없으면 null. */
export function toTimestampOrNull(value: string | Date | null | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * 이번 요청이 마감일을 **바꾸는가**. 요청에 없거나(undefined) 같은 순간을 다시 보내면 거짓이다.
 * 수정 폼이 전체 객체를 다시 보내는 경우를 사람의 조정으로 세지 않기 위해서다.
 */
export function isDueDateChange(
  requested: string | null | undefined,
  current: Date | null
): boolean {
  if (requested === undefined) return false;
  if (requested === null) return current !== null;
  return toTimestampOrNull(requested) !== toTimestampOrNull(current);
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
 * 서비스 카테고리가 해당 고객사에서 사용 가능한지 검증합니다.
 * 전역 카테고리(clientId = null)이거나 해당 고객사 전용 카테고리만 허용합니다.
 */
export async function ensureCategoryBelongsToClient(
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
export function collectOperatorFieldChanges(
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
export async function buildSRUpdateData(
  validated: z.infer<typeof srUpdateSchema>,
  existingSR: SR,
  sessionUser: AuthenticatedUser,
  assigneeId?: string | null,
  /** 한 번 완료된 SR 이라 자동 재산출하지 않는다(D9 — 헌법 §2 가 §3 보다 우선). */
  freezeDueDate = false
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
  if (validated.actualPriority !== undefined) updateData.actualPriority = validated.actualPriority;
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
  // 마감일 수동 조정. 값이 실제로 바뀔 때만 수동 표식을 세운다 — 같은 값 재전송(수정 폼이 전체를
  // 다시 보내는 경우)은 사람의 지정이 아니다. 비우기는 updateSR 이 이미 거부했다.
  const dueDateChanged = isDueDateChange(validated.dueDate, existingSR.dueDate);
  if (dueDateChanged) {
    updateData.dueDate = new Date(validated.dueDate as string);
    updateData.dueDateManual = true;
  }
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
      await ensureCategoryBelongsToClient(
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

  // 운영자가 마감일을 직접 지정했다면 — 이번 요청이든 예전이든(due_date_manual) — 그 값을 자동
  // 산출로 덮어쓰지 않는다(헌법 §3). 예전에는 이번 요청만 봐서 다음 우선순위 변경 때 덮어써졌다.
  const dueDateManuallySet = dueDateChanged;

  if (
    (priorityChanged || categoryChanged) &&
    nextPriority &&
    !dueDateManuallySet &&
    !existingSR.dueDateManual &&
    !freezeDueDate
  ) {
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
