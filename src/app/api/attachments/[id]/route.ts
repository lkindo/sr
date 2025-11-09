import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { deleteAttachmentBlob } from "@/lib/storage";

// DELETE /api/attachments/[id] - 첨부파일 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const attachment = await prisma.sRAttachment.findUnique({
      where: { id: params.id },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "첨부파일을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // SR 접근 권한 체크
    const sr = await prisma.sR.findUnique({
      where: { id: attachment.srId },
      select: { requesterId: true, assigneeId: true },
    });

    if (!sr) {
      return NextResponse.json(
        { error: "SR을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 파일 삭제 (Vercel Blob)
    const pathname =
      attachment.storagePath ??
      (attachment.fileUrl.startsWith("http")
        ? new URL(attachment.fileUrl).pathname.slice(1)
        : "");
    if (pathname) {
      await deleteAttachmentBlob(pathname);
    }

    // DB에서 삭제
    await prisma.sRAttachment.delete({
      where: { id: params.id },
    });

    // 활동 내역 추가
    await prisma.sRActivity.create({
      data: {
        srId: attachment.srId,
        userId: session.user.id,
        type: "ATTACHMENT_REMOVED",
        description: `파일 삭제: ${attachment.fileName}`,
      },
    });

    // SR의 attachmentCount 업데이트
    await prisma.sR.update({
      where: { id: attachment.srId },
      data: {
        attachmentCount: {
          decrement: 1,
        },
      },
    });

    return NextResponse.json({ message: "파일이 삭제되었습니다." });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json(
      { error: "파일 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// GET /api/attachments/[id] - 첨부파일 다운로드
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const attachment = await prisma.sRAttachment.findUnique({
      where: { id: params.id },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "첨부파일을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(attachment);
  } catch (error) {
    console.error("Error fetching attachment:", error);
    return NextResponse.json(
      { error: "첨부파일 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}


