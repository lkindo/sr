import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { withAuthAndRateLimit, AuthenticatedContext } from "@/lib/auth-wrapper";
import { NotFoundError, BadRequestError } from "@/lib/errors";
import { RouteContext } from "@/lib/api-helpers";
import { validateFile, FileValidationError } from "@/lib/file-validator";

// Force Node.js runtime (file system operations require Node.js)
export const runtime = 'nodejs';

/**
 * SR 첨부파일 업로드 API
 *
 * 파일 보안 검증:
 * - 파일 확장자 검증 (위험한 실행 파일 차단)
 * - Magic Number 기반 MIME 타입 검증 (스푸핑 방지)
 * - 파일 크기 검증 (타입별 제한)
 * - 허용된 파일 형식만 업로드 가능
 *
 * @param request - FormData (files: File[])
 * @param params - { id: srId }
 * @returns 201 - 업로드된 첨부파일 목록
 * @returns 400 - 검증 실패
 * @returns 404 - SR not found
 *
 * Rate Limit: 1분당 60회 (strict preset)
 */
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
    throw new NotFoundError("SR을 찾을 수 없습니다.");
  }

  // FormData에서 파일 추출
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (files.length === 0) {
    throw new BadRequestError("업로드할 파일을 선택해주세요.");
  }

  // 파일 개수 제한 (한 번에 최대 10개)
  if (files.length > 10) {
    throw new BadRequestError("한 번에 최대 10개의 파일만 업로드할 수 있습니다.");
  }

  // 업로드 디렉토리 생성
  const uploadDir = join(process.cwd(), "public", "uploads", "attachments");
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }

  const uploadedAttachments = [];
  const validationErrors: { fileName: string; error: string }[] = [];

  for (const file of files) {
    try {
      // 파일 검증 (확장자, 내용, 크기)
      const { mimeType, size } = await validateFile(file);

      // 파일명 생성 (타임스탬프 + 원본 파일명)
      const timestamp = Date.now();
      const safeFileName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
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
          fileSize: size,
          fileType: mimeType, // 검증된 MIME 타입 사용
          storagePath: filePath,
          uploadedBy: session.user.id,
        },
      });

      uploadedAttachments.push({
        ...attachment,
        createdAt: attachment.createdAt.toISOString(),
      });

    } catch (error) {
      if (error instanceof FileValidationError) {
        validationErrors.push({
          fileName: file.name,
          error: error.message,
        });
      } else {
        throw error; // 예상하지 못한 에러는 상위로 전파
      }
    }
  }

  // 모든 파일이 검증 실패한 경우
  if (uploadedAttachments.length === 0 && validationErrors.length > 0) {
    throw new BadRequestError(
      `모든 파일이 검증에 실패했습니다: ${validationErrors.map(e => `${e.fileName} - ${e.error}`).join(', ')}`
    );
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
      success: true,
      message: `${uploadedAttachments.length}개의 파일이 업로드되었습니다.`,
      data: {
        attachments: uploadedAttachments,
        errors: validationErrors.length > 0 ? validationErrors : undefined,
      },
    },
    { status: 201 }
  );
}, { preset: 'strict' }); // 1분당 60회 (민감한 작업)

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
