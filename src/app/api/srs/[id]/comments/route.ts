import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { sendCommentNotificationEmail } from "@/lib/email";

const commentSchema = z.object({
  content: z.string().min(1, "댓글 내용을 입력해주세요."),
});

// GET /api/srs/[id]/comments - SR 댓글 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const comments = await prisma.sRComment.findMany({
      where: { srId: params.id },
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
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json(
      { error: "댓글 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/srs/[id]/comments - 새 댓글 추가
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = commentSchema.parse(body);

    // Check if SR exists and get related data
    const sr = await prisma.sR.findUnique({
      where: { id: params.id },
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
      return NextResponse.json(
        { error: "SR을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const comment = await prisma.sRComment.create({
      data: {
        srId: params.id,
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
        srId: params.id,
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues?.[0];
      return NextResponse.json(
        { error: firstError?.message || "유효성 검사 실패" },
        { status: 400 }
      );
    }

    console.error("Error creating comment:", error);
    return NextResponse.json(
      { error: "댓글 추가 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
