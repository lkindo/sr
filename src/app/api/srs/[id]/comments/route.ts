import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { sendCommentNotificationEmail } from "@/lib/email";

const commentSchema = z.object({
  content: z.string().min(1, "댓글 내용을 입력해주세요."),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// GET /api/srs/[id]/comments - SR 댓글 목록 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
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
      createdAt: "asc",
    },
  });

  return NextResponse.json(comments);
}, { preset: 'standard' }); // 1분당 100회

// POST /api/srs/[id]/comments - 새 댓글 추가 (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(async (
  request: NextRequest,
  { session, params }: { session: any; params: RouteContext["params"] }
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
    include: {
      requester: {
        select: {
          id: true,
          email: true,
        },
      },
      assignee: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  if (!sr) {
    throw new NotFoundError("SR을 찾을 수 없습니다.");
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
      type: "COMMENTED",
      description: "댓글이 추가되었습니다.",
    },
  });

  // Send email notifications to requester and assignee (non-blocking)
  if (process.env.RESEND_API_KEY) {
    const recipients = new Set<string>();

    // Notify requester if not the commenter
    if (sr.requester.id !== session.user.id) {
      recipients.add(sr.requester.email);
    }

    // Notify assignee if exists and not the commenter
    if (sr.assignee && sr.assignee.id !== session.user.id) {
      recipients.add(sr.assignee.email);
    }

    // Send emails to all recipients
    recipients.forEach((email) => {
      sendCommentNotificationEmail({
        to: email,
        srId: sr.id,
        srNumber: sr.srNumber,
        title: sr.title,
        commentAuthor: comment.user.name,
        commentContent: validated.content,
      }).catch((error) => {
        console.error("Failed to send comment notification email:", error);
      });
    });
  }

  return NextResponse.json(comment, { status: 201 });
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)
