import { NextRequest, NextResponse } from 'next/server';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { FileValidationError, validateFile } from '@/lib/file-validator';
import { ensureCanReadSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { uploadAttachmentBlob } from '@/lib/storage';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// POST /api/attachments - 파일 업로드 (Rate Limit: 파일 업로드 전용)
export const POST = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const srId = formData.get('srId') as string;

    if (!file || !srId) {
      throw new BadRequestError('파일과 SR ID가 필요합니다.');
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestError('파일 크기는 10MB를 초과할 수 없습니다.');
    }

    // SR 존재 + 접근 권한 체크 (IDOR 방지 — 임의 SR 에 첨부 금지)
    const sr = await prisma.sR.findUnique({
      where: { id: srId },
      select: { id: true, clientId: true, requesterId: true, assigneeId: true },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }
    ensureCanReadSR(session.user, sr);

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

    // DB에 첨부파일 정보 저장 (fileUrl 은 생성 후 id 기반 인증 다운로드 경로로 갱신)
    const attachment = await prisma.sRAttachment.create({
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

    // fileUrl 을 인증 다운로드 라우트로 설정 (attachment id 필요)
    const fileUrl = `/api/attachments/${attachment.id}/download`;
    await prisma.sRAttachment.update({ where: { id: attachment.id }, data: { fileUrl } });
    attachment.fileUrl = fileUrl;

    // 활동 내역 추가
    await prisma.sRActivity.create({
      data: {
        srId,
        userId: session.user.id,
        type: 'ATTACHMENT_ADDED',
        description: `파일 추가: ${file.name}`,
      },
    });

    // 첨부 개수는 조회 시 _count 로 계산하므로 별도 스칼라 컬럼을 유지하지 않는다.

    return NextResponse.json(attachment, { status: 201 });
  },
  { preset: 'fileUpload' }
); // 1분당 20회 (파일 업로드는 더 제한적)
