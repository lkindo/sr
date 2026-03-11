import { NextRequest, NextResponse } from 'next/server';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { ensureCanUpdateSR } from '@/lib/policies';
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

    // SR 존재 확인 및 권한 체크
    const sr = await prisma.sR.findUnique({
      where: { id: srId },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    ensureCanUpdateSR(session.user, sr);

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
        type: 'ATTACHMENT_ADDED',
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
  },
  { preset: 'fileUpload' }
); // 1분당 20회 (파일 업로드는 더 제한적)
