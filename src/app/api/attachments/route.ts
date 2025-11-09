import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { uploadAttachmentBlob } from "@/lib/storage";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// POST /api/attachments - 파일 업로드
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const srId = formData.get("srId") as string;

    if (!file || !srId) {
      return NextResponse.json(
        { error: "파일과 SR ID가 필요합니다." },
        { status: 400 }
      );
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 10MB를 초과할 수 없습니다." },
        { status: 400 }
      );
    }

    // SR 존재 확인 및 권한 체크
    const sr = await prisma.sR.findUnique({
      where: { id: srId },
      select: { id: true, requesterId: true, assigneeId: true },
    });

    if (!sr) {
      return NextResponse.json(
        { error: "SR을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 파일 저장 (Vercel Blob)
    const uploadResult = await uploadAttachmentBlob(srId, file);

    // DB에 첨부파일 정보 저장
    const attachment = await prisma.sRAttachment.create({
      data: {
        srId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileUrl: uploadResult.url,
        storagePath: uploadResult.pathname,
        uploadedBy: session.user.id,
      },
    });

    // 활동 내역 추가
    await prisma.sRActivity.create({
      data: {
        srId,
        userId: session.user.id,
        type: "ATTACHMENT_ADDED",
        description: `파일 추가: ${file.name}`,
      },
    });

    // SR의 attachmentCount 업데이트
    await prisma.sR.update({
      where: { id: srId },
      data: {
        attachmentCount: {
          increment: 1,
        },
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "파일 업로드 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}


