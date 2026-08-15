import { NextRequest, NextResponse } from 'next/server';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { getSRUrl } from '@/lib/app-url';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { PAGINATION } from '@/lib/constants';
import { NotFoundError } from '@/lib/errors';
import { ensureCanCommentOnSR, ensureCanReadSR, isInternalUser } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SR_ACCESS_SELECT, SR_ALIVE } from '@/lib/prisma-selects';
import { commentSchema } from '@/lib/schemas';
import { backgroundTask } from '@/lib/wait-until';
import { emailService } from '@/services/email.service';
import { enqueueEmails, type OutboxEmail } from '@/services/notification-outbox';

// GET /api/srs/[id]/comments - SR 댓글 목록 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    _request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // 인가 판정에만 쓰므로 전체 행을 읽지 않는다(db-rules §4).
    const sr = await prisma.sR.findUnique({
      where: { id, ...SR_ALIVE },
      select: SR_ACCESS_SELECT,
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
      // 상한을 건다 (감사 D-17). 서비스 계층은 커서 페이지네이션으로 상한을 지키는데
      // 이 라우트만 전량을 조인해 왔다.
      take: PAGINATION.MAX_PAGE_SIZE,
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

    const validated = await validateRequestBody(request, commentSchema);

    // Check if SR exists and get related data
    const sr = await prisma.sR.findUnique({
      where: { id, ...SR_ALIVE },
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

    // 읽기 권한이 아니라 쓰기 권한으로 게이트한다 —
    // `ensureCanCommentOnSR` 이 읽기 가능 여부 + `COMMENT:CREATE` 를 함께 본다(감사 4.1).
    ensureCanCommentOnSR(session.user, sr);

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

      // 이메일 아웃박스도 댓글/활동과 같은 트랜잭션에 적재한다. 커밋 직후 프로세스가
      // 종료돼도 "댓글은 있는데 보내야 할 알림 행은 없음" 상태가 생기지 않는다.
      const outbox: OutboxEmail[] = [];
      const shouldSendRequester = sr.requester.notificationPreference?.emailCommentAdded ?? false;
      if (sr.requester.id !== session.user.id && sr.requester.email && shouldSendRequester) {
        outbox.push({
          ...emailService.buildCommentAdded(
            sr.requester.email,
            sr.srNumber,
            sr.title,
            created.user.name,
            validated.content,
            getSRUrl(sr.id)
          ),
          metadata: { srId: sr.id, kind: 'comment-added', role: 'requester' },
        });
      }

      if (sr.assignee && sr.assignee.id !== session.user.id && sr.assignee.email) {
        const shouldSendAssignee = sr.assignee.notificationPreference?.emailCommentAdded ?? false;
        if (shouldSendAssignee) {
          outbox.push({
            ...emailService.buildCommentAdded(
              sr.assignee.email,
              sr.srNumber,
              sr.title,
              created.user.name,
              validated.content,
              getSRUrl(sr.id)
            ),
            metadata: { srId: sr.id, kind: 'comment-added', role: 'assignee' },
          });
        }
      }

      await enqueueEmails(outbox, tx);

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

    /**
     * 푸시 알림 (감사 4.3).
     *
     * `pushCommentAdded` 설정은 스키마·설정 UI·`sendForEvent` 에 전부 배선돼 있었는데
     * **이 경로가 pushService 를 한 번도 호출하지 않아** 통째로 죽어 있었다.
     * 사용자가 토글을 켜도 댓글 푸시는 오지 않았다.
     *
     * 수신자는 이메일과 동일한 규칙으로 고른다 — 요청자와 담당자 중 작성자 본인 제외.
     * 설정 확인은 `sendForEvent` 가 담당하므로 여기서는 대상만 추린다.
     */
    const pushTargets = [sr.requester.id, sr.assignee?.id].filter(
      (userId): userId is string => Boolean(userId) && userId !== session.user.id
    );

    if (pushTargets.length > 0) {
      const { pushService } = await import('@/services/push.service');
      backgroundTask(
        pushService.sendForEvent('COMMENT_ADDED', [...new Set(pushTargets)], {
          title: '새 댓글',
          body: `${sr.srNumber}: ${comment.user.name}님이 댓글을 남겼습니다.`,
          url: `/srs/${sr.id}`,
          tag: 'comment-added',
        }),
        'comment-push-dispatch'
      );
    }

    return NextResponse.json(comment, { status: 201 });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
