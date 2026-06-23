import { NextRequest, NextResponse } from 'next/server';
import { $Enums, Prisma } from '@prisma/client';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { SLA } from '@/lib/constants';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { ensureCanReadSR, isInternalUser } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { intakeSchema, intakeUpdateSchema } from '@/lib/schemas';

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

    // 권한 체크: SR.INTAKE 권한 또는 ADMIN, MANAGER, ENGINEER 역할
    const userRoles = session.user?.roles || [];
    const hasIntakePermission =
      session.user?.permissions?.some((p: string) => {
        const normalized = p.toUpperCase();
        return normalized === 'SR:INTAKE' || normalized === 'SR:CREATE';
      }) ?? false;
    const hasIntakeRole = userRoles.some((role: string) =>
      ['ADMIN', 'MANAGER', 'ENGINEER'].includes(role)
    );

    if (!hasIntakePermission && !hasIntakeRole) {
      throw new ForbiddenError(
        'SR 접수 권한이 없습니다. SR.INTAKE 권한 또는 ADMIN/MANAGER/ENGINEER 역할이 필요합니다.'
      );
    }

    // 1. 요청 바디 검증
    const validated = await validateRequestBody(request, intakeSchema);

    // 2. SR 조회 및 상태 확인, 담당자 조회를 하나의 쿼리로 병합
    const [sr, assignee] = await prisma.$transaction([
      prisma.sR.findUnique({
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
      }),
      prisma.user.findUnique({
        where: { id: validated.assigneeId },
        select: {
          id: true,
          name: true,
          email: true,
        },
      }),
    ]);

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

    if (!assignee) {
      throw new NotFoundError('담당자');
    }

    // 4. SLA 기반 마감일 자동 계산
    const slaHours = sr.serviceCategory.slaHours;
    const adjustedHours = slaHours * SLA.PRIORITY_MULTIPLIER[validated.actualPriority];
    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + adjustedHours);

    // 5. SR 업데이트 (REQUESTED → INTAKE) 및 상태 이력 생성
    const updatedSR = await prisma.sR.update({
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
        estimatedHours: validated.estimatedHours,
        estimatedCompletionDate: new Date(validated.estimatedCompletionDate),
        dueDate: dueDate,
        intakeNotes: validated.intakeNotes || null,
        assignee: {
          connect: { id: validated.assigneeId },
        },
      },
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        serviceCategory: true,
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
      },
    });

    // 6. Activity 로그 생성
    await prisma.sRActivity.create({
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

    // 7. 상태 이력 생성 - 이미 94-110 라인에서 SR 업데이트 시 statusHistory가 INTAKE로 생성됨
    // 중복 생성 코드 제거 (기존에 IN_PROGRESS로 잘못 기록되던 버그 수정)

    // 8. 담당자 배정 Activity 로그
    await prisma.sRActivity.create({
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

    ensureCanReadSR(session.user, sr as any);

    return NextResponse.json(sr);
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
      const adjustedHours =
        sr.serviceCategory.slaHours * SLA.PRIORITY_MULTIPLIER[validated.actualPriority];
      dueDate = new Date(sr.intakeAt || new Date());
      dueDate.setHours(dueDate.getHours() + adjustedHours);
    }

    // 6. 담당자 조회 (변경 시)
    let newAssignee = null;
    const isAssigneeChanged =
      validated.assigneeId !== undefined && validated.assigneeId !== sr.assigneeId;

    if (isAssigneeChanged && validated.assigneeId) {
      newAssignee = await prisma.user.findUnique({
        where: { id: validated.assigneeId },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      if (!newAssignee) {
        throw new NotFoundError('담당자');
      }
    }

    // 7. SR 업데이트
    const updateData: Prisma.SRUncheckedUpdateInput = {};
    if (validated.actualPriority !== undefined) {
      updateData.actualPriority = validated.actualPriority;
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

    const updatedSR = await prisma.sR.update({
      where: { id },
      data: updateData,
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        serviceCategory: true,
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
      },
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

      // 새 담당자에게만 메일 발송 (담당자가 배정된 경우만)
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
