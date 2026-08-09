import { NextRequest, NextResponse } from 'next/server';
import { $Enums, Prisma } from '@prisma/client';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { domainEvents } from '@/lib/domain-events';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { ensureCanReadSR, INTERNAL_ROLES, isInternalUser } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { CLIENT_SUMMARY_SELECT, USER_SUMMARY_SELECT } from '@/lib/prisma-selects';
import { emitRealtimeEvent, REALTIME_EVENTS } from '@/lib/realtime-events';
import { intakeSchema, intakeUpdateSchema } from '@/lib/schemas';
import { serializeResponse } from '@/lib/serialization';
import { serviceCategoryService } from '@/services/service-category.service';
import { assertAssignable } from '@/services/sr.service';

// POST(접수)와 PATCH(접수정보 수정)의 응답 include. 두 곳에 31줄이 축자 복제돼 있었다.
//
// `client` 는 반드시 select 로 좁힌다 — `client: true` 로 두면 담당자명·이메일·전화번호·
// 주소·계약 시작/종료일까지 응답에 실린다. 원본이 {id, code, name} 만 고른 것은 의도다.
const SR_INTAKE_INCLUDE = {
  client: { select: CLIENT_SUMMARY_SELECT },
  serviceCategory: true,
  requester: { select: USER_SUMMARY_SELECT },
  assignee: { select: USER_SUMMARY_SELECT },
  intakeBy: { select: USER_SUMMARY_SELECT },
} as const;

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/srs/{id}/intake - SR 접수 처리 (Rate Limit: 엄격)
// SR.INTAKE 권한이 있는 사용자만 접수 가능
export const POST = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 권한 체크: 접수(Intake)는 담당 엔지니어 배정·SLA 산정 등 운영팀의 트리아지 행위이므로
    const userRoles = session.user?.roles || [];
    const hasIntakePermission =
      session.user?.permissions?.some((p: string) => p.toUpperCase() === 'SR:INTAKE') ?? false;
    const hasIntakeRole = userRoles.some((role: string) => INTERNAL_ROLES.includes(role));

    if (!hasIntakePermission && !hasIntakeRole) {
      throw new ForbiddenError(
        'SR 접수 권한이 없습니다. SR:INTAKE 권한 또는 ADMIN/MANAGER/ENGINEER 역할이 필요합니다.'
      );
    }

    // 1. 요청 바디 검증
    const validated = await validateRequestBody(request, intakeSchema);

    // 2. SR 조회 및 상태 확인
    const sr = await prisma.sR.findUnique({
      where: { id },
      include: {
        serviceCategory: true,
        client: true,
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    // Multi-tenant Isolation: External users can only intake their own client's SR
    if (!isInternalUser(session.user)) {
      const userClientIds = session.user.clientIds || [];
      if (!userClientIds.includes(sr.clientId)) {
        throw new ForbiddenError('해당 고객사의 SR을 접수 처리할 권한이 없습니다.');
      }
    }

    if (sr.status !== 'REQUESTED') {
      throw new BadRequestError('이미 접수된 SR입니다');
    }

    // 3. 담당자 검증: 존재 / 활성 / SR 처리 권한(내부 담당자)을 한 규칙으로 판정한다.
    //    배정 경로가 세 곳(intake POST · intake PATCH · updateSR)이므로 규칙은 assertAssignable
    //    한 곳에만 두고 모두 공유한다. (과거: POST 는 존재·활성만 확인해 CLIENT_USER 도
    //    담당자로 지정될 수 있었다.)
    const assignee = await assertAssignable(validated.assigneeId);

    // 4. SLA 기반 마감일 자동 계산
    //    계산은 serviceCategoryService 한 곳에만 둔다 — 예전에는 같은 구문이 네 곳에
    //    복제돼 있었고, 그 구현이 `setHours` 로 소수 시간을 절삭했다(감사 4.3).
    const dueDate = serviceCategoryService.calculateDueDateFromHours(
      sr.serviceCategory.slaHours,
      validated.actualPriority
    );

    // 5. SR 업데이트 (REQUESTED → INTAKE) — 하나의 트랜잭션에서 원자적으로 처리
    //    상태 변경 + 상태 이력 + 활동 로그를 함께 커밋하여 중간 실패 시
    //    부분 기록(상태만 바뀌고 활동 로그 누락 등)이 남지 않도록 한다.
    const updatedSR = await prisma.$transaction(async (tx) => {
      // 낙관적 동시성 제어: REQUESTED 상태일 때만 접수 진행 (동시 이중 접수 방지).
      // 상태 조건 매칭이 0건이면 그 사이 다른 트랜잭션이 먼저 접수한 것이다.
      const guard = await tx.sR.updateMany({
        where: { id, status: 'REQUESTED' },
        data: { updatedAt: new Date() },
      });
      if (guard.count === 0) {
        throw new ConflictError('이미 접수되었거나 다른 사용자가 먼저 접수 처리했습니다.');
      }

      const result = await tx.sR.update({
        where: { id },
        data: {
          status: 'INTAKE',
          intakeAt: new Date(),
          intakeBy: {
            connect: { id: session.user.id },
          },
          statusHistory: {
            create: {
              previousStatus: 'REQUESTED',
              currentStatus: 'INTAKE',
              changedBy: session.user.id,
              changeReason: 'SR 접수 처리',
            },
          },
          actualPriority: validated.actualPriority,
          // `priority` 는 목록·필터·정렬이 쓰는 **실효 우선순위**다
          // (schema.prisma 의 @@index([status, priority, createdAt])).
          // 생성 시 requestedPriority 로 한 번 세팅된 뒤 접수에서 갱신되지 않아,
          // 접수자가 LOW → CRITICAL 로 올려도 목록은 계속 '낮음' 으로 보이고
          // '긴급' 필터에도 잡히지 않았다. 접수가 정한 값을 실효값으로 승격한다.
          priority: validated.actualPriority,
          estimatedHours: validated.estimatedHours,
          estimatedCompletionDate: new Date(validated.estimatedCompletionDate),
          dueDate: dueDate,
          intakeNotes: validated.intakeNotes || null,
          assignee: {
            connect: { id: validated.assigneeId },
          },
        },
        include: SR_INTAKE_INCLUDE,
      });

      // 6. Activity 로그 생성 (상태 변경)
      await tx.sRActivity.create({
        data: {
          srId: id,
          userId: session.user.id,
          type: $Enums.SRActivityType.STATUS_CHANGED,
          description: `SR이 접수되었습니다 (담당자: ${assignee.name})`,
          metadata: {
            previousStatus: 'REQUESTED',
            currentStatus: 'INTAKE',
            actualPriority: validated.actualPriority,
            estimatedHours: validated.estimatedHours,
            estimatedCompletionDate: validated.estimatedCompletionDate,
            assigneeId: validated.assigneeId,
            assigneeName: assignee.name,
          },
        },
      });

      // 7. 담당자 배정 Activity 로그
      await tx.sRActivity.create({
        data: {
          srId: id,
          userId: session.user.id,
          type: $Enums.SRActivityType.ASSIGNED,
          description: `담당자가 배정되었습니다: ${assignee.name}`,
          metadata: {
            assigneeId: assignee.id,
            assigneeName: assignee.name,
          },
        },
      });

      return result;
    });

    // 8. 트랜잭션 커밋 후 사이드 이펙트 발행.
    //    접수는 "요청자에게는 상태 변경, 담당자에게는 신규 배정"이라는 두 가지 사실을 만든다.
    //    이 라우트에는 그동안 어떤 이벤트도 없어서, 접수·배정 알림이 아예 발송되지 않았고
    //    다른 세션의 목록도 갱신되지 않았다(감사 3.21). SRService.updateSR 과 같은 패턴이다.
    domainEvents.emit('sr:status_changed', {
      srId: updatedSR.id,
      srNumber: updatedSR.srNumber,
      title: updatedSR.title,
      requesterId: updatedSR.requesterId,
      previousStatus: 'REQUESTED',
      currentStatus: updatedSR.status,
    });

    domainEvents.emit('sr:assigned', {
      srId: updatedSR.id,
      srNumber: updatedSR.srNumber,
      title: updatedSR.title,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
    });

    emitRealtimeEvent(REALTIME_EVENTS.SR_UPDATED, {
      id: updatedSR.id,
      srNumber: updatedSR.srNumber,
      title: updatedSR.title,
      status: updatedSR.status,
      // 권한 필터링용 키: SSE 연결별 테넌트/역할 격리 및 본인 에코(중복 토스트) 방지
      clientId: updatedSR.clientId,
      requesterId: updatedSR.requesterId,
      assigneeId: updatedSR.assigneeId,
      actorId: session.user.id,
    });

    return NextResponse.json(
      {
        success: true,
        sr: updatedSR,
        message: 'SR이 성공적으로 접수되었습니다',
      },
      { status: 200 }
    );
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)

// GET /api/srs/{id}/intake - 접수 정보 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const sr = await prisma.sR.findUnique({
      where: { id },
      select: {
        id: true,
        clientId: true,
        requesterId: true,
        assigneeId: true,
        srNumber: true,
        title: true,
        description: true,
        status: true,
        requestedPriority: true,
        requestedCompletionDate: true,
        actualPriority: true,
        intakeNotes: true,
        estimatedHours: true,
        estimatedCompletionDate: true,
        dueDate: true,
        intakeAt: true,
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        intakeBy: {
          select: {
            id: true,
            name: true,
            email: true,
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
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            fileType: true,
            fileUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    ensureCanReadSR(session.user, sr);

    // attachments.fileSize 는 Prisma BigInt 이므로 직렬화 후 응답
    // (미변환 시 JSON.stringify TypeError → 첨부가 있는 SR 의 접수 정보 조회가 500)
    return NextResponse.json(serializeResponse(sr));
  },
  { preset: 'standard' }
); // 1분당 100회

// PATCH /api/srs/{id}/intake - 접수 정보 수정 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 1. 권한 확인: MANAGER 또는 ADMIN만 접수 정보 수정 가능
    const userRoles = session.user?.roles || [];
    const hasPermission = userRoles.some((role: string) => role === 'ADMIN' || role === 'MANAGER');

    if (!hasPermission) {
      throw new ForbiddenError(
        '접수 정보를 수정할 권한이 없습니다. MANAGER 또는 ADMIN 권한이 필요합니다.'
      );
    }

    // 2. 요청 바디 검증
    const validated = await validateRequestBody(request, intakeUpdateSchema);

    // 최소 하나의 필드는 수정되어야 함 (undefined가 아닌 값이 있어야 함)
    const hasAnyField =
      validated.actualPriority !== undefined ||
      validated.estimatedHours !== undefined ||
      validated.estimatedCompletionDate !== undefined ||
      validated.intakeNotes !== undefined ||
      validated.assigneeId !== undefined;

    if (!hasAnyField) {
      throw new BadRequestError('수정할 정보를 최소 하나 이상 입력해주세요.');
    }

    // 3. SR 조회 및 상태 확인
    const sr = await prisma.sR.findUnique({
      where: { id },
      include: {
        serviceCategory: true,
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    if (sr.status !== 'INTAKE' && sr.status !== 'IN_PROGRESS') {
      throw new BadRequestError('접수되었거나 진행 중인 SR만 접수 정보를 수정할 수 있습니다');
    }

    // 4. 변경 전 값 저장 (이력 추적용)
    const previousValues = {
      actualPriority: sr.actualPriority,
      estimatedHours: sr.estimatedHours,
      estimatedCompletionDate: sr.estimatedCompletionDate,
      intakeNotes: sr.intakeNotes,
      assigneeId: sr.assigneeId,
      assigneeName: sr.assignee?.name || null,
    };

    // 5. SLA 재계산 (우선순위 변경 시)
    let dueDate = sr.dueDate;
    if (validated.actualPriority && validated.actualPriority !== sr.actualPriority) {
      dueDate = serviceCategoryService.calculateDueDateFromHours(
        sr.serviceCategory.slaHours,
        validated.actualPriority,
        sr.intakeAt || new Date()
      );
    }

    // 6. 담당자 검증 및 조회 (변경 시)
    //    존재 여부만 확인하면 비활성 사용자에게도 배정되어, 로그인할 수 없는 담당자에게
    //    묶인 orphan SR 이 생기고 이후 그 사용자를 정상적으로 비활성화할 수도 없다.
    //    (updateSR 과 동일한 규칙을 쓰도록 assertAssignable 를 공유한다.)
    let newAssignee: { id: string; name: string; email: string } | null = null;
    const isAssigneeChanged =
      validated.assigneeId !== undefined && validated.assigneeId !== sr.assigneeId;

    if (isAssigneeChanged && validated.assigneeId) {
      newAssignee = await assertAssignable(validated.assigneeId);
    }

    // 7. SR 업데이트
    const updateData: Prisma.SRUncheckedUpdateInput = {};
    if (validated.actualPriority !== undefined) {
      updateData.actualPriority = validated.actualPriority;
      // POST(접수)와 같은 이유로 실효 우선순위도 함께 옮긴다. 여기만 빠뜨리면
      // 에스컬레이션(접수 정보 수정)이 목록에 반영되지 않는 원래 증상이 그대로 남는다.
      updateData.priority = validated.actualPriority;
    }
    if (validated.estimatedHours !== undefined) {
      updateData.estimatedHours = validated.estimatedHours;
    }
    if (validated.estimatedCompletionDate !== undefined) {
      updateData.estimatedCompletionDate = new Date(validated.estimatedCompletionDate);
    }
    if (validated.intakeNotes !== undefined) {
      updateData.intakeNotes = validated.intakeNotes || null;
    }
    if (validated.assigneeId !== undefined) {
      updateData.assigneeId = validated.assigneeId || null;
    }
    if (dueDate && validated.actualPriority && validated.actualPriority !== sr.actualPriority) {
      updateData.dueDate = dueDate;
    }

    // 낙관적 동시성 제어: 스냅샷(sr.status) 이후 상태가 바뀌지 않았을 때만 수정한다.
    // (동시 인테이크 수정으로 인한 lost update 방지 — updateSR/intake POST 와 동일 패턴)
    const updatedSR = await prisma.$transaction(async (tx) => {
      const guard = await tx.sR.updateMany({
        where: { id, status: sr.status },
        data: { updatedAt: new Date() },
      });
      if (guard.count === 0) {
        throw new ConflictError(
          '다른 사용자가 먼저 이 SR을 변경했습니다. 새로고침 후 다시 시도해주세요.'
        );
      }

      return tx.sR.update({
        where: { id },
        data: updateData,
        include: SR_INTAKE_INCLUDE,
      });
    });

    // 8. 변경 사항 추적 및 이력 생성
    const changes: string[] = [];
    const newValues: {
      actualPriority?: string;
      estimatedHours?: number;
      estimatedCompletionDate?: string;
      intakeNotes?: string | null;
      assigneeId?: string;
      assigneeName?: string | null;
    } = {};

    if (validated.actualPriority && validated.actualPriority !== previousValues.actualPriority) {
      changes.push(`우선순위: ${previousValues.actualPriority} → ${validated.actualPriority}`);
      newValues.actualPriority = validated.actualPriority;
    }
    const prevEstimatedHours =
      previousValues.estimatedHours !== null && previousValues.estimatedHours !== undefined
        ? Number(previousValues.estimatedHours)
        : undefined;

    if (validated.estimatedHours !== undefined && validated.estimatedHours !== prevEstimatedHours) {
      changes.push(
        `예상 작업 시간: ${prevEstimatedHours !== undefined ? prevEstimatedHours : '미정'}시간 → ${validated.estimatedHours}시간`
      );
      newValues.estimatedHours = validated.estimatedHours;
    }
    if (
      validated.estimatedCompletionDate &&
      new Date(validated.estimatedCompletionDate).getTime() !==
        new Date(previousValues.estimatedCompletionDate || 0).getTime()
    ) {
      changes.push(`예상 완료일 변경`);
      newValues.estimatedCompletionDate = validated.estimatedCompletionDate;
    }
    if (
      validated.intakeNotes !== undefined &&
      validated.intakeNotes !== previousValues.intakeNotes
    ) {
      changes.push('접수 메모 수정');
      newValues.intakeNotes = validated.intakeNotes;
    }
    if (isAssigneeChanged) {
      const newAssigneeName = validated.assigneeId ? newAssignee?.name || '미배정' : '미배정';
      changes.push(`담당자: ${previousValues.assigneeName || '미배정'} → ${newAssigneeName}`);
      newValues.assigneeId = validated.assigneeId || undefined;
      newValues.assigneeName = newAssignee?.name || null;
    }

    // 9. 접수 수정 Activity 로그 생성
    if (changes.length > 0) {
      await prisma.sRActivity.create({
        data: {
          srId: id,
          userId: session.user.id,
          type: $Enums.SRActivityType.INTAKE_UPDATED,
          description: `접수 정보가 수정되었습니다: ${changes.join(', ')}`,
          metadata: {
            previousValues,
            newValues,
            changes,
            updatedBy: session.user.name || session.user.email,
          },
        },
      });
    }

    // 10. 담당자 변경 시 알림 발송 및 Activity 로그
    if (isAssigneeChanged) {
      // 담당자 배정 Activity 로그
      const newAssigneeName = validated.assigneeId ? newAssignee?.name || '미배정' : '미배정';
      await prisma.sRActivity.create({
        data: {
          srId: id,
          userId: session.user.id,
          type: validated.assigneeId
            ? $Enums.SRActivityType.ASSIGNED
            : $Enums.SRActivityType.REASSIGNED,
          description: validated.assigneeId
            ? `담당자가 변경되었습니다: ${previousValues.assigneeName || '미배정'} → ${newAssigneeName}`
            : `담당자가 해제되었습니다: ${previousValues.assigneeName || '미배정'}`,
          metadata: {
            previousAssigneeId: previousValues.assigneeId,
            previousAssigneeName: previousValues.assigneeName,
            newAssigneeId: validated.assigneeId || null,
            newAssigneeName: newAssignee?.name || null,
          },
        },
      });

      // 배정 이벤트 발행 — 알림 리스너가 새 담당자에게 메일/푸시를 보낸다.
      // 이 자리에는 "새 담당자에게만 메일 발송" 이라는 주석만 있고 구현이 없어서,
      // 재배정된 담당자가 자기에게 일이 왔다는 사실을 전혀 통보받지 못했다(감사 3.21).
      // 배정 해제(null)도 발행한다 — 이전 담당자 화면의 상태를 정리해야 한다.
      domainEvents.emit('sr:assigned', {
        srId: updatedSR.id,
        srNumber: updatedSR.srNumber,
        title: updatedSR.title,
        assigneeId: validated.assigneeId || null,
        assigneeName: validated.assigneeId ? newAssignee?.name || '알 수 없음' : null,
      });
    }

    // 변경이 하나라도 있으면 다른 세션의 목록·상세를 갱신시킨다.
    if (changes.length > 0) {
      emitRealtimeEvent(REALTIME_EVENTS.SR_UPDATED, {
        id: updatedSR.id,
        srNumber: updatedSR.srNumber,
        title: updatedSR.title,
        status: updatedSR.status,
        clientId: updatedSR.clientId,
        requesterId: updatedSR.requesterId,
        assigneeId: updatedSR.assigneeId,
        actorId: session.user.id,
      });
    }

    return NextResponse.json(
      {
        success: true,
        sr: updatedSR,
        message: '접수 정보가 성공적으로 수정되었습니다',
        changes: changes.length > 0 ? changes : undefined,
      },
      { status: 200 }
    );
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
