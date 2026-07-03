import { NextRequest, NextResponse } from 'next/server';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { auditService } from '@/services/audit.service';

/**
 * 승인 권한 판정.
 * - 시스템 운영자(ADMIN/MANAGER): 모든 고객사 소속 승인/거절 가능
 * - 해당 고객사의 CLIENT_ADMIN: 본인이 "승인된" 소속을 가진 고객사에 한해 승인/거절 가능
 *   (actor.clientIds 는 auth.ts 에서 이미 APPROVED 소속만 담고 있으므로 그대로 신뢰 가능)
 */
function ensureCanApproveMembership(
  actor: { roles: string[]; clientIds: string[] },
  clientId: string
): void {
  const isSystemApprover = actor.roles.includes('ADMIN') || actor.roles.includes('MANAGER');
  const isClientAdminOfSameClient =
    actor.roles.includes('CLIENT_ADMIN') && actor.clientIds.includes(clientId);

  if (!isSystemApprover && !isClientAdminOfSameClient) {
    throw new ForbiddenError('이 고객사 소속을 승인/거절할 권한이 없습니다.');
  }
}

// POST /api/users/[id]/client/approve - 셀프 회원가입으로 생성된 PENDING 소속 승인
export const POST = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id: targetUserId } = await params;
    const actor = session.user;

    const pending = await prisma.userClient.findFirst({
      where: { userId: targetUserId, status: 'PENDING' },
    });
    if (!pending) {
      throw new NotFoundError('승인 대기 중인 고객사 소속');
    }

    ensureCanApproveMembership(actor, pending.clientId);

    await prisma.$transaction(async (tx) => {
      await tx.userClient.update({
        where: { id: pending.id },
        data: { status: 'APPROVED', approvedAt: new Date() },
      });
      await auditService.createLog(tx, {
        userId: actor.id,
        actionType: 'APPROVE',
        targetEntity: 'UserClient',
        targetId: pending.id,
        changes: { userId: targetUserId, clientId: pending.clientId, status: 'APPROVED' },
      });
    });

    return NextResponse.json({
      success: true,
      message: '고객사 소속이 승인되었습니다.',
      data: { userId: targetUserId, clientId: pending.clientId },
    });
  },
  { preset: 'standard' }
);

// DELETE /api/users/[id]/client/approve - PENDING 소속 거절(삭제)
export const DELETE = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id: targetUserId } = await params;
    const actor = session.user;

    const pending = await prisma.userClient.findFirst({
      where: { userId: targetUserId, status: 'PENDING' },
    });
    if (!pending) {
      throw new NotFoundError('승인 대기 중인 고객사 소속');
    }

    ensureCanApproveMembership(actor, pending.clientId);

    await prisma.$transaction(async (tx) => {
      await tx.userClient.delete({ where: { id: pending.id } });
      await auditService.createLog(tx, {
        userId: actor.id,
        actionType: 'REJECT',
        targetEntity: 'UserClient',
        targetId: pending.id,
        changes: { userId: targetUserId, clientId: pending.clientId, status: 'REJECTED' },
      });
    });

    return NextResponse.json({
      success: true,
      message: '고객사 소속 신청이 거절되었습니다.',
      data: { userId: targetUserId, clientId: pending.clientId },
    });
  },
  { preset: 'standard' }
);
