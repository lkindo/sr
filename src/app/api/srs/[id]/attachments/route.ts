import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { withAuthAndRateLimit, AuthenticatedContext } from "@/lib/auth-wrapper";
import { NotFoundError, ValidationError, BadRequestError } from "@/lib/errors";
import { RouteContext } from "@/lib/api-helpers";

// Force Node.js runtime (file system operations require Node.js)
export const runtime = 'nodejs';

// POST /api/srs/[id]/attachments - Upload attachments (Rate Limit: 엄격)
export const POST = withAuthAndRateLimit(async (
  req: NextRequest,
  { session, params }: AuthenticatedContext<RouteContext<{ id: string }>["params"]>
) => {
  const { id: srId } = await params;
  const { invalidateCache, invalidateCachePattern } = await import('@/lib/redis-cache')
  const { srDetailKey, MY_REQUESTS_PREFIX } = await import('@/lib/cache-keys')

  // SR 존재 확인
  const sr = await prisma.sR.findUnique({
    where: { id: srId },
  });

  if (!sr) {
    throw new NotFoundError("SR not found");
  }

  // FormData에서 파일 추출
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (files.length === 0) {
    throw new BadRequestError("No files provided");
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
      throw new BadRequestError(`File ${file.name} exceeds 10MB limit`);
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

  // Invalidate caches: detail and my-requests (첨부 카운트 등 반영)
  try {
    await invalidateCache(srDetailKey(srId));
    await invalidateCachePattern(`${MY_REQUESTS_PREFIX}*`);
  } catch (e) {
    console.warn('Cache invalidation failed after attachments upload:', e);
  }

  return NextResponse.json(
    {
      message: "Files uploaded successfully",
      attachments: uploadedAttachments,
    },
    { status: 201 }
  );
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)

// GET /api/srs/[id]/attachments - Get all attachments for an SR (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (
  req: NextRequest,
  { params }: AuthenticatedContext<RouteContext<{ id: string }>["params"]>
) => {
  const { id: srId } = await params;

  const attachments = await prisma.sRAttachment.findMany({
    where: { srId },
    orderBy: {
      createdAt: "desc",
    },
  });

  return NextResponse.json(attachments);
}, { preset: 'standard' }); // 1분당 100회
