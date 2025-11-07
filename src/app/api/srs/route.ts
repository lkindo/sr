import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { sendSRCreatedEmail } from "@/lib/email";

const srSchema = z.object({
  title: z.string().min(5, "제목은 최소 5자 이상이어야 합니다."),
  description: z.string().min(10, "설명은 최소 10자 이상이어야 합니다."),
  clientId: z.string().min(1, "고객사를 선택해주세요."),
  serviceCategoryId: z.string().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  requestedCompletionDate: z.string().optional(),
});

// GET /api/srs - SR 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const clientId = searchParams.get("clientId");
    const priority = searchParams.get("priority");

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (priority) {
      where.priority = priority;
    }

    const srs = await prisma.sR.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        serviceCategory: {
          select: {
            id: true,
            categoryName: true,
          },
        },
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(srs);
  } catch (error) {
    console.error("Error fetching SRs:", error);
    return NextResponse.json(
      { error: "SR 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/srs - 새 SR 생성
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = srSchema.parse(body);

    // Generate SR number (format: SR-YYYYMMDD-XXXX)
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

    // Get count of SRs created today
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const todayEnd = new Date(today.setHours(23, 59, 59, 999));

    const todayCount = await prisma.sR.count({
      where: {
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    const srNumber = `SR-${dateStr}-${String(todayCount + 1).padStart(4, "0")}`;

    const sr = await prisma.sR.create({
      data: {
        srNumber,
        title: validated.title,
        description: validated.description,
        clientId: validated.clientId,
        serviceCategoryId: validated.serviceCategoryId,
        requesterId: session.user.id,
        priority: validated.priority,
        status: "REQUESTED",
        requestedCompletionDate: validated.requestedCompletionDate
          ? new Date(validated.requestedCompletionDate)
          : undefined,
      },
      include: {
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        serviceCategory: {
          select: {
            id: true,
            categoryName: true,
          },
        },
        requester: {
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
        srId: sr.id,
        userId: session.user.id,
        type: "STATUS_CHANGE",
        description: "SR이 생성되었습니다.",
      },
    });

    // Create status history
    await prisma.sRStatusHistory.create({
      data: {
        srId: sr.id,
        fromStatus: "REQUESTED",
        toStatus: "REQUESTED",
        changedBy: session.user.id,
        changeReason: "SR 생성",
      },
    });

    // Send email notification (non-blocking)
    if (process.env.RESEND_API_KEY) {
      sendSRCreatedEmail({
        to: sr.requester.email,
        srId: sr.id,
        srNumber: sr.srNumber,
        title: sr.title,
        description: sr.description,
        priority: sr.priority,
        clientName: sr.client.name,
        requesterName: sr.requester.name,
        requesterEmail: sr.requester.email,
      }).catch((error) => {
        console.error("Failed to send SR created email:", error);
        // Don't fail the request if email sending fails
      });
    }

    return NextResponse.json(sr, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Error creating SR:", error);
    return NextResponse.json(
      { error: "SR 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
