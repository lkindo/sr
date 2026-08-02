import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { parseJsonBody, RouteContext } from '@/lib/api-helpers';
import { getSRUrl } from '@/lib/app-url';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { firstZodIssueMessage, NotFoundError, ValidationError } from '@/lib/errors';
import { ensureCanReadSR, isInternalUser } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { FIELD_LIMITS } from '@/lib/schemas';

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

    /**
     * `isInternal` 은 선언만 되어 있고 어디서도 읽히거나 쓰이지 않았다(감사 4.2).
     * 지금은 아무도 이 플래그를 세우지 않으므로 새는 것이 없지만, 누군가 세우는 순간
     * 이 조회에 필터가 없어 내부 노트가 고객에게 그대로 나간다 — 선언된 통제가 실제로는
     * 없는 상태였고, 그건 없느니만 못하다. 여기서 필터를 걸어 함정을 없앤다.
     *
     * 부수 효과로 `@@index([srId, isInternal, createdAt])` 가 비로소 쓰이게 된다.
     * 내부 사용자는 `[srId, createdAt]` 를, 외부 사용자는 3열 인덱스를 탄다.
     */
    const comments = await prisma.sRComment.findMany({
      where: {
        srId: id,
        ...(isInternalUser(session.user) ? {} : { isInternal: false }),
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
        throw new ValidationError(firstZodIssueMessage(error));
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

    // 이메일은 아웃박스에 적재한다. 예전에는 여기서 SMTP 로 곧장 쐈고, 실패하면
    // 기록도 재시도도 없이 사라졌다(감사 4.2). 이제 디스패처가 집어 보내고 결과를 남긴다.
    const { emailService } = await import('@/services/email.service');
    const { enqueueEmails } = await import('@/services/notification-outbox');
    const outbox = [];

    // Requester check (Schema: emailCommentAdded Boolean @default(false))
    const shouldSendRequester = sr.requester.notificationPreference?.emailCommentAdded ?? false;
    if (sr.requester.id !== session.user.id && sr.requester.email && shouldSendRequester) {
      outbox.push({
        ...emailService.buildCommentAdded(
          sr.requester.email,
          sr.srNumber,
          sr.title,
          comment.user.name,
          validated.content,
          getSRUrl(sr.id)
        ),
        metadata: { srId: sr.id, kind: 'comment-added', role: 'requester' },
      });
    }

    // Assignee check
    if (sr.assignee && sr.assignee.id !== session.user.id && sr.assignee.email) {
      const shouldSendAssignee = sr.assignee.notificationPreference?.emailCommentAdded ?? false;
      if (shouldSendAssignee) {
        outbox.push({
          ...emailService.buildCommentAdded(
            sr.assignee.email,
            sr.srNumber,
            sr.title,
            comment.user.name,
            validated.content,
            getSRUrl(sr.id)
          ),
          metadata: { srId: sr.id, kind: 'comment-added', role: 'assignee' },
        });
      }
    }

    if (outbox.length > 0) {
      await enqueueEmails(outbox);
    }

    return NextResponse.json(comment, { status: 201 });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
