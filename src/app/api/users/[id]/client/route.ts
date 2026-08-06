import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError } from '@/lib/errors';
import { INTERNAL_ROLES } from '@/lib/policies';
import prisma from '@/lib/prisma';

/**
 * 고객사 할당/변경 요청 바디 스키마
 * force: 진행 중인 SR이 있어도 강제로 소속을 변경할지 여부
 */
const clientAssignSchema = z.object({
  clientId: z.string().min(1, '고객사 ID가 필요합니다'),
  force: z.boolean().optional(),
});

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

    await prisma.userClient.delete({
      where: { id: existingRelation.id },
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

    // UserClient 관계 업데이트 또는 생성
    if (existingRelation) {
      // 이미 다른 고객사에 소속되어 있으면 업데이트
      await prisma.userClient.update({
        where: { id: existingRelation.id },
        data: { clientId },
      });
    } else {
      // 소속이 없으면 새로 생성
      await prisma.userClient.create({
        data: {
          userId,
          clientId,
        },
      });
    }

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
