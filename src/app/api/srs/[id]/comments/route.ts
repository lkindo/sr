import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { RouteContext } from '@/lib/api-helpers';
import { getSRUrl } from '@/lib/app-url';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { MY_REQUESTS_PREFIX, srDetailKey } from '@/lib/cache-keys';
import { NotFoundError, ValidationError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { invalidateCache, invalidateCachePattern } from '@/lib/redis-cache';

const commentSchema = z.object({
  content: z.string().min(1, '댓글 내용을 입력해주세요.'),
});

// GET /api/srs/[id]/comments - SR 댓글 목록 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    _request: NextRequest,
    { params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

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

    const body = await request.json();
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
      throw new NotFoundError('SR을 찾을 수 없습니다.');
    }

    const comment = await prisma.sRComment.create({
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

    // Create activity log
    await prisma.sRActivity.create({
      data: {
        srId: id,
        userId: session.user.id,
        type: 'COMMENTED',
        description: '댓글이 추가되었습니다.',
      },
    });

    // Invalidate caches: detail and my-requests (댓글 카운트 등 반영)
    try {
      await invalidateCache(srDetailKey(id));
      await invalidateCachePattern(`${MY_REQUESTS_PREFIX}*`);
    } catch (e) {
      console.warn('Cache invalidation failed after comment create:', e);
    }

    // Send email notifications to requester and assignee (non-blocking)
    const { emailService } = await import('@/services/email.service');

    // Requester check
    const requesterPrefs = sr.requester.notificationPreference;
    // Schema: emailCommentAdded Boolean @default(false)
    const shouldSendRequester = requesterPrefs?.emailCommentAdded ?? false;

    if (sr.requester.id !== session.user.id && sr.requester.email && shouldSendRequester) {
      emailService
        .sendCommentAdded(
          sr.requester.email,
          sr.srNumber,
          sr.title,
          comment.user.name,
          validated.content,
          getSRUrl(sr.id)
        )
        .catch((e) => console.error('Failed to send comment email to requester:', e));
    }

    // Assignee check
    if (sr.assignee && sr.assignee.id !== session.user.id && sr.assignee.email) {
      const assigneePrefs = sr.assignee.notificationPreference;
      const shouldSendAssignee = assigneePrefs?.emailCommentAdded ?? false;

      if (shouldSendAssignee) {
        emailService
          .sendCommentAdded(
            sr.assignee.email,
            sr.srNumber,
            sr.title,
            comment.user.name,
            validated.content,
            getSRUrl(sr.id)
          )
          .catch((e) => console.error('Failed to send comment email to assignee:', e));
      }
    }

    return NextResponse.json(comment, { status: 201 });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
