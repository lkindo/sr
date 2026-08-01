import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { parseJsonBody, RouteContext } from '@/lib/api-helpers';
import { getSRUrl } from '@/lib/app-url';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { ensureCanReadSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { FIELD_LIMITS } from '@/lib/schemas';
import { backgroundTask } from '@/lib/wait-until';

const commentSchema = z.object({
  // 상한이 없으면 인증된 단일 POST 로 거대한 텍스트를 sr_comments.content(무제한 TEXT)에
  // 영속시킬 수 있다(감사 4.3). 공용 상수를 써서 다른 자유 텍스트 필드와 기준을 맞춘다.
  content: z
    .string()
    .min(1, '댓글 내용을 입력해주세요.')
    .max(FIELD_LIMITS.NOTE, `댓글은 ${FIELD_LIMITS.NOTE}자를 초과할 수 없습니다.`),
});

// GET /api/srs/[id]/comments - SR 댓글 목록 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    _request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const sr = await prisma.sR.findUnique({
      where: { id },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    ensureCanReadSR(session.user, sr);

    const comments = await prisma.sRComment.findMany({
      where: { srId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return NextResponse.json(comments);
  },
  { preset: 'standard' }
); // 1분당 100회

// POST /api/srs/[id]/comments - 새 댓글 추가 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const body = await parseJsonBody(request);
    let validated;
    try {
      validated = commentSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message);
      }
      throw error;
    }

    // Check if SR exists and get related data
    const sr = await prisma.sR.findUnique({
      where: { id },
      select: {
        id: true,
        clientId: true,
        requesterId: true,
        assigneeId: true,
        srNumber: true,
        title: true,
        requester: {
          select: {
            id: true,
            email: true,
            notificationPreference: true,
          },
        },
        assignee: {
          select: {
            id: true,
            email: true,
            notificationPreference: true,
          },
        },
      },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    ensureCanReadSR(session.user, sr);

    // 댓글 + 활동로그를 하나의 트랜잭션으로 커밋 (중간 실패 시 감사 이력 불일치 방지)
    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.sRComment.create({
        data: {
          srId: id,
          userId: session.user.id,
          content: validated.content,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      await tx.sRActivity.create({
        data: {
          srId: id,
          userId: session.user.id,
          type: 'COMMENTED',
          description: '댓글이 추가되었습니다.',
        },
      });

      return created;
    });

    // 실시간 이벤트 발송
    const { emitRealtimeEvent, REALTIME_EVENTS } = await import('@/lib/realtime-events');
    emitRealtimeEvent(REALTIME_EVENTS.SR_COMMENTED, {
      srId: id,
      commentId: comment.id,
      userId: session.user.id,
      action: 'created',
      // 권한 필터링용 키: SSE 연결별 테넌트/역할 격리 및 본인 에코 방지
      clientId: sr.clientId,
      requesterId: sr.requesterId,
      assigneeId: sr.assigneeId,
      actorId: session.user.id,
    });

    // 이메일 알림(비차단): 서버리스에서 유실되지 않도록 요청 수명(waitUntil)에 연결한다.
    const { emailService } = await import('@/services/email.service');
    const emailTasks: Promise<unknown>[] = [];

    // Requester check (Schema: emailCommentAdded Boolean @default(false))
    const shouldSendRequester = sr.requester.notificationPreference?.emailCommentAdded ?? false;
    if (sr.requester.id !== session.user.id && sr.requester.email && shouldSendRequester) {
      emailTasks.push(
        emailService.sendCommentAdded(
          sr.requester.email,
          sr.srNumber,
          sr.title,
          comment.user.name,
          validated.content,
          getSRUrl(sr.id)
        )
      );
    }

    // Assignee check
    if (sr.assignee && sr.assignee.id !== session.user.id && sr.assignee.email) {
      const shouldSendAssignee = sr.assignee.notificationPreference?.emailCommentAdded ?? false;
      if (shouldSendAssignee) {
        emailTasks.push(
          emailService.sendCommentAdded(
            sr.assignee.email,
            sr.srNumber,
            sr.title,
            comment.user.name,
            validated.content,
            getSRUrl(sr.id)
          )
        );
      }
    }

    if (emailTasks.length > 0) {
      backgroundTask(Promise.allSettled(emailTasks), 'comment-email');
    }

    return NextResponse.json(comment, { status: 201 });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
