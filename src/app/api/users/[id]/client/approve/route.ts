import { NextRequest, NextResponse } from 'next/server';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError } from '@/lib/errors';
import { ensureCanApproveMembership } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { auditService } from '@/services/audit.service';

// 승인 권한 판정은 policies.ensureCanApproveMembership — 운영 관리자는 모든 고객사, CLIENT_ADMIN 은
// 자기가 승인된 소속을 가진 고객사만(세션 clientIds 는 auth.ts 가 APPROVED 소속만 담는다).

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
