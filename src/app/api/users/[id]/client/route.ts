import { NextRequest, NextResponse } from 'next/server';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError } from '@/lib/errors';
import { INTERNAL_ROLES } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SR_ALIVE } from '@/lib/prisma-selects';
import { clientAssignSchema } from '@/lib/schemas';
import { auditService } from '@/services/audit.service';

/**
 * 고객사 할당/변경 요청 바디 스키마
 * force: 진행 중인 SR이 있어도 강제로 소속을 변경할지 여부
 */
/**
 * 고객사 소속 관리 권한 판정 (ADMIN, MANAGER만 가능)
 */
async function ensureCanManageUserClient(actorId: string): Promise<void> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId: actorId },
    include: { role: true },
  });

  const hasPermission = userRoles.some((ur) => ['ADMIN', 'MANAGER'].includes(ur.role.name));

  if (!hasPermission) {
    throw new ForbiddenError('권한이 없습니다');
  }
}

// DELETE /api/users/[id]/client - 사용자 소속 고객사 해제
export const DELETE = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id: userId } = await params;

    // 권한 확인 (ADMIN, MANAGER만 가능)
    await ensureCanManageUserClient(session.user.id);

    // 기존 UserClient 관계 확인 및 삭제
    const existingRelation = await prisma.userClient.findFirst({
      where: { userId },
    });

    if (!existingRelation) {
      return NextResponse.json({ error: '소속된 고객사가 없습니다' }, { status: 404 });
    }

    // 고객사 팀 역할을 가진 사용자는 고객사 할당을 해제할 수 없음
    const targetUserRoles = await prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });

    const hasClientTeamRole = targetUserRoles.some((ur) =>
      ['CLIENT_ADMIN', 'CLIENT_USER'].includes(ur.role.name)
    );

    if (hasClientTeamRole) {
      const clientRoles = targetUserRoles
        .filter((ur) => ['CLIENT_ADMIN', 'CLIENT_USER'].includes(ur.role.name))
        .map((ur) => ur.role.name);

      return NextResponse.json(
        {
          error: '고객사 팀 역할을 가진 사용자는 고객사 할당을 해제할 수 없습니다',
          details: `현재 역할: ${clientRoles.join(', ')}`,
          suggestion: '먼저 고객사 팀 역할을 제거한 후 고객사 할당을 해제하세요.',
          clientRoles,
        },
        { status: 400 }
      );
    }

    // 소속 해제는 그 사용자가 볼 수 있는 데이터 범위를 바꾸는 민감 행위다.
    // 헌법 §1.2 는 이런 행위를 감사 로그로 영구 저장하라고 규정하는데, 이 경로만
    // 빠져 있었다(감사 D-16) — 형제 경로인 `approve` 는 처음부터 남기고 있었다.
    // 삭제와 로그를 같은 트랜잭션에 묶어 "바뀌었는데 기록이 없는" 상태를 막는다.
    await prisma.$transaction(async (tx) => {
      await tx.userClient.delete({ where: { id: existingRelation.id } });
      await auditService.createLog(tx, {
        userId: session.user.id,
        actionType: 'DELETE',
        targetEntity: 'UserClient',
        targetId: existingRelation.id,
        changes: { userId, clientId: existingRelation.clientId },
      });
    });

    return NextResponse.json({
      success: true,
      message: '고객사 소속이 해제되었습니다',
    });
  },
  { preset: 'standard' }
);

// PATCH /api/users/[id]/client - 사용자 소속 고객사 변경
export const PATCH = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id: userId } = await params;
    const { clientId, force } = await validateRequestBody(request, clientAssignSchema);

    // 권한 확인 (ADMIN, MANAGER만 가능)
    await ensureCanManageUserClient(session.user.id);

    // 고객사 존재 확인
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return NextResponse.json({ error: '고객사를 찾을 수 없습니다' }, { status: 404 });
    }

    // 대상 사용자의 역할 확인 - 시스템 운영팀은 고객사 할당 불가
    const targetUserRoles = await prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });

    const isSystemTeam = targetUserRoles.some((ur) => INTERNAL_ROLES.includes(ur.role.name));

    if (isSystemTeam) {
      const systemRoles = targetUserRoles
        .filter((ur) => INTERNAL_ROLES.includes(ur.role.name))
        .map((ur) => ur.role.name)
        .join(', ');

      return NextResponse.json(
        {
          error: '시스템 운영팀(ADMIN, MANAGER, ENGINEER)은 고객사를 할당할 수 없습니다',
          details: `현재 역할: ${systemRoles}`,
        },
        { status: 400 }
      );
    }

    // 기존 UserClient 관계 확인
    const existingRelation = await prisma.userClient.findFirst({
      where: { userId },
      include: {
        client: {
          select: { id: true, name: true },
        },
      },
    });

    // 진행 중인 SR 확인 (요청자, 담당자, 접수자로 참여 중인 SR)
    const ongoingSRs = await prisma.sR.findMany({
      where: {
        ...SR_ALIVE,
        OR: [{ requesterId: userId }, { assigneeId: userId }, { intakeById: userId }],
        status: {
          in: ['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD'],
        },
        ...(existingRelation ? { clientId: existingRelation.clientId } : {}),
      },
      select: {
        id: true,
        srNumber: true,
        title: true,
        status: true,
        priority: true,
        client: {
          select: { name: true },
        },
        assignee: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 진행 중인 SR이 있고 강제 이동이 아니면 409로 거부 (소속은 변경되지 않음)
    // 호출자는 사용자 확인 후 force: true로 재요청해야 합니다.
    if (ongoingSRs.length > 0 && !force) {
      return NextResponse.json(
        {
          error: '진행 중인 SR이 있습니다',
          code: 'ONGOING_SRS',
          data: {
            ongoingSRs: ongoingSRs.map((sr) => ({
              id: sr.id,
              srNumber: sr.srNumber,
              title: sr.title,
              status: sr.status,
              priority: sr.priority,
              clientName: sr.client.name,
              assigneeName: sr.assignee?.name,
            })),
            ongoingSRCount: ongoingSRs.length,
            sourceClient: existingRelation?.client,
            targetClient: { id: client.id, name: client.name },
          },
        },
        { status: 409 }
      );
    }

    // UserClient 관계 업데이트 또는 생성 — 감사 로그와 같은 트랜잭션에서 수행한다.
    // 소속 변경은 데이터 접근 범위를 바꾸므로 "누가 언제 어디서 어디로" 가 남아야 한다.
    await prisma.$transaction(async (tx) => {
      if (existingRelation) {
        // 이미 다른 고객사에 소속되어 있으면 업데이트
        await tx.userClient.update({
          where: { id: existingRelation.id },
          data: { clientId },
        });
        await auditService.createLog(tx, {
          userId: session.user.id,
          actionType: 'UPDATE',
          targetEntity: 'UserClient',
          targetId: existingRelation.id,
          changes: { userId, before: existingRelation.clientId, after: clientId },
        });
      } else {
        // 소속이 없으면 새로 생성
        const created = await tx.userClient.create({
          data: {
            userId,
            clientId,
          },
        });
        await auditService.createLog(tx, {
          userId: session.user.id,
          actionType: 'CREATE',
          targetEntity: 'UserClient',
          targetId: created.id,
          changes: { userId, before: null, after: clientId },
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: '사용자 소속이 변경되었습니다',
      data: {
        userId,
        newClientId: clientId,
        newClientName: client.name,
        ongoingSRsHandled: ongoingSRs.length,
      },
    });
  },
  { preset: 'standard' }
);
