import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "attachments");
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

    // 파일 저장
    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.name}`;
    const filePath = path.join(UPLOAD_DIR, srId);

    // 디렉토리 생성
    if (!existsSync(filePath)) {
      await mkdir(filePath, { recursive: true });
    }

    const fullPath = path.join(filePath, fileName);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await writeFile(fullPath, buffer);

    // DB에 첨부파일 정보 저장
    const fileUrl = `/uploads/attachments/${srId}/${fileName}`;
    const attachment = await prisma.sRAttachment.create({
      data: {
        srId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileUrl,
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


