import { NextRequest, NextResponse } from 'next/server';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { FileValidationError, validateFile } from '@/lib/file-validator';
import { ensureCanReadSR } from '@/lib/policies';
import prisma from '@/lib/prisma';

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
export const POST = withAuthAndRateLimit(
  async (
    req: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id: srId } = await params;

    // SR 존재 확인
    const sr = await prisma.sR.findUnique({
      where: { id: srId },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    ensureCanReadSR(session.user, sr);

    // FormData에서 파일 추출
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      throw new BadRequestError('업로드할 파일을 선택해주세요.');
    }

    // 파일 개수 제한 (한 번에 최대 10개)
    if (files.length > 10) {
      throw new BadRequestError('한 번에 최대 10개의 파일만 업로드할 수 있습니다.');
    }

    // 업로드 디렉토리 생성
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'attachments');
    await mkdir(uploadDir, { recursive: true });

    // 모든 파일에 대해 동일한 타임스탬프 사용 (배치 처리)
    const timestamp = Date.now();

    const results = await Promise.all(
      files.map(async (file, index) => {
        try {
          // 파일 검증 (확장자, 내용, 크기)
          const { mimeType, size } = await validateFile(file);

          // 파일명 생성 (타임스탬프 + 인덱스 + 원본 파일명) - 병렬 처리 시 타임스탬프 충돌 방지
          const safeFileName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
          const fileName = `${timestamp}_${index}_${safeFileName}`;
          const filePath = join(uploadDir, fileName);

          // 파일 저장 (스트림 사용으로 메모리 효율화)
          const writableStream = createWriteStream(filePath);
          await pipeline(Readable.fromWeb(file.stream() as any), writableStream);

          // DB 저장 데이터 준비
          const attachmentData = {
            srId,
            fileName: file.name,
            fileUrl: `/uploads/attachments/${fileName}`,
            fileSize: size,
            fileType: mimeType, // 검증된 MIME 타입 사용
            storagePath: filePath,
            uploadedBy: session.user.id,
          };

          return {
            status: 'fulfilled' as const,
            value: attachmentData,
          };
        } catch (error) {
          if (error instanceof FileValidationError) {
            return {
              status: 'rejected' as const,
              reason: error,
              fileName: file.name,
            };
          }
          throw error; // 예상하지 못한 에러는 상위로 전파 (Promise.all 중단)
        }
      })
    );

    const attachmentsToInsert = results
      .filter((r): r is { status: 'fulfilled'; value: any } => r.status === 'fulfilled')
      .map((r) => r.value);

    let createdAttachments: any[] = [];
    if (attachmentsToInsert.length > 0) {
      createdAttachments = await prisma.sRAttachment.createManyAndReturn({
        data: attachmentsToInsert,
      });
    }

    const uploadedAttachments = createdAttachments.map((attachment) => ({
      ...attachment,
      createdAt: attachment.createdAt.toISOString(),
    }));

    const validationErrors = results
      .filter(
        (r): r is { status: 'rejected'; reason: FileValidationError; fileName: string } =>
          r.status === 'rejected'
      )
      .map((r) => ({
        fileName: r.fileName,
        error: r.reason.message,
      }));

    // 모든 파일이 검증 실패한 경우
    if (uploadedAttachments.length === 0 && validationErrors.length > 0) {
      throw new BadRequestError(
        `모든 파일이 검증에 실패했습니다: ${validationErrors.map((e) => `${e.fileName} - ${e.error}`).join(', ')}`
      );
    }

    // Invalidate caches: detail and my-requests (첨부 카운트 등 반영)

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
  },
  { preset: 'strict' }
); // 1분당 60회 (민감한 작업)

// GET /api/srs/[id]/attachments - Get all attachments for an SR (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    req: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id: srId } = await params;

    const sr = await prisma.sR.findUnique({
      where: { id: srId },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    ensureCanReadSR(session.user, sr);

    const attachments = await prisma.sRAttachment.findMany({
      where: { srId },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(attachments);
  },
  { preset: 'standard' }
); // 1분당 100회
