import { NextRequest, NextResponse } from 'next/server';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import {
  FileValidationError,
  formatBytes,
  MAX_UPLOAD_FILE_SIZE,
  validateFile,
} from '@/lib/file-validator';
import { ensureCanAttachToSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SR_ALIVE } from '@/lib/prisma-selects';
import { serializeResponse } from '@/lib/serialization';
import { deleteAttachmentBlob, uploadAttachmentBlob } from '@/lib/storage';
import { assertUploadSizeWithinLimit } from '@/lib/upload-guard';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// POST /api/attachments - 파일 업로드 (Rate Limit: 파일 업로드 전용)
export const POST = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    // 본문 파싱 전 선검사. 상한은 배치 업로드 라우트와 같은 상수를 쓴다 —
    // 예전에는 같은 논리적 작업이 URL 에 따라 10MB / 100MB 두 계약을 가졌다(감사 3.41).
    assertUploadSizeWithinLimit(request);

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const srId = formData.get('srId') as string;

    if (!file || !srId) {
      throw new BadRequestError('파일과 SR ID가 필요합니다.');
    }

    // 파일 크기 검증
    if (file.size > MAX_UPLOAD_FILE_SIZE) {
      throw new BadRequestError(
        `파일 크기는 ${formatBytes(MAX_UPLOAD_FILE_SIZE)}를 초과할 수 없습니다.`
      );
    }

    // SR 존재 + 쓰기 권한 체크 (IDOR 방지 — 임의 SR 에 첨부 금지)
    // 업로드는 쓰기이므로 읽기 권한이 아니라 수정 권한으로 게이트한다(감사 4.1).
    const sr = await prisma.sR.findUnique({
      where: { id: srId, ...SR_ALIVE },
      select: { id: true, clientId: true, requesterId: true, assigneeId: true, status: true },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }
    ensureCanAttachToSR(session.user, sr);

    // 파일 내용 검증 (확장자 + magic-byte MIME + 타입별 크기) — 저장형 XSS/스푸핑 방지
    let mimeType: string;
    let size: number;
    try {
      ({ mimeType, size } = await validateFile(file));
    } catch (error) {
      if (error instanceof FileValidationError) {
        throw new BadRequestError(error.message);
      }
      throw error;
    }

    // 파일 저장 (웹루트 밖 STORAGE_DIR)
    const uploadResult = await uploadAttachmentBlob(srId, file);

    /**
     * 행 생성 · fileUrl 채움 · 활동 로그를 한 트랜잭션에 묶는다.
     *
     * 예전에는 세 문장이 각각 독립 실행됐다(감사 4.2). 중간에 실패하면
     * `fileUrl = ''` 인 죽은 링크가 남거나, 감사 추적 없는 첨부가 남았다.
     * 파일 업로드는 트랜잭션 밖이므로, 실패 시 방금 올린 blob 을 되돌린다 —
     * 그러지 않으면 참조 없는 파일이 디스크에 영구히 쌓인다.
     */
    let attachment;
    try {
      attachment = await prisma.$transaction(async (tx) => {
        const created = await tx.sRAttachment.create({
          data: {
            srId,
            fileName: file.name,
            fileSize: size,
            fileType: mimeType, // 검증된 MIME 타입 사용
            fileUrl: '',
            storagePath: uploadResult.pathname,
            uploadedBy: session.user.id,
          },
        });

        // fileUrl 은 인증 다운로드 라우트이고 id 가 필요하므로 생성 후에 채운다.
        const withUrl = await tx.sRAttachment.update({
          where: { id: created.id },
          data: { fileUrl: `/api/attachments/${created.id}/download` },
        });

        await tx.sRActivity.create({
          data: {
            srId,
            userId: session.user.id,
            type: 'ATTACHMENT_ADDED',
            description: `파일 추가: ${file.name}`,
          },
        });

        return withUrl;
      });
    } catch (error) {
      await deleteAttachmentBlob(uploadResult.pathname).catch(() => {
        // 정리 실패는 원래 오류를 가리지 않는다. 고아 blob 은 남지만 요청은 실패로 끝난다.
      });
      throw error;
    }

    // 첨부 개수는 조회 시 _count 로 계산하므로 별도 스칼라 컬럼을 유지하지 않는다.

    // storagePath(내부 저장 경로)는 클라이언트에 노출하지 않음
    const { storagePath: _storagePath, ...safeAttachment } = attachment;

    // fileSize 는 Prisma BigInt 이므로 직렬화 후 응답 (미변환 시 JSON.stringify TypeError → 500)
    return NextResponse.json(serializeResponse(safeAttachment), { status: 201 });
  },
  { preset: 'fileUpload' }
); // 1분당 20회 (파일 업로드는 더 제한적)
