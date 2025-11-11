import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// Force Node.js runtime (file system operations require Node.js)
export const runtime = 'nodejs';

// POST /api/srs/[id]/attachments - Upload attachments
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: srId } = await params;

    // SR 존재 확인
    const sr = await prisma.sR.findUnique({
      where: { id: srId },
    });

    if (!sr) {
      return NextResponse.json({ error: "SR not found" }, { status: 404 });
    }

    // FormData에서 파일 추출
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    // 업로드 디렉토리 생성
    const uploadDir = join(process.cwd(), "public", "uploads", "attachments");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const uploadedAttachments = [];

    for (const file of files) {
      // 파일 크기 검증 (10MB)
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds 10MB limit` },
          { status: 400 }
        );
      }

      // 파일명 생성 (타임스탬프 + 원본 파일명)
      const timestamp = Date.now();
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const fileName = `${timestamp}_${safeFileName}`;
      const filePath = join(uploadDir, fileName);

      // 파일 저장
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      // DB에 첨부파일 정보 저장
      const attachment = await prisma.sRAttachment.create({
        data: {
          srId,
          fileName: file.name,
          fileUrl: `/uploads/attachments/${fileName}`,
          fileSize: file.size,
          fileType: file.type,
          storagePath: filePath,
          uploadedBy: session.user.id,
        },
      });

      uploadedAttachments.push(attachment);
    }

    return NextResponse.json(
      {
        message: "Files uploaded successfully",
        attachments: uploadedAttachments,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error uploading attachments:", error);
    return NextResponse.json(
      { error: "Failed to upload attachments" },
      { status: 500 }
    );
  }
}

// GET /api/srs/[id]/attachments - Get all attachments for an SR
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: srId } = await params;

    const attachments = await prisma.sRAttachment.findMany({
      where: { srId },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(attachments);
  } catch (error) {
    console.error("Error fetching attachments:", error);
    return NextResponse.json(
      { error: "Failed to fetch attachments" },
      { status: 500 }
    );
  }
}
