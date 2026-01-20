import { NextRequest, NextResponse } from 'next/server';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError } from '@/lib/errors';
import { ensureCanUpdateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { deleteAttachmentBlob } from '@/lib/storage';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/attachments/[id] - 첨부파일 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const attachment = await prisma.sRAttachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundError('첨부파일');
    }

    return NextResponse.json(attachment);
  },
  { preset: 'standard' }
); // 1분당 100회

// DELETE /api/attachments/[id] - 첨부파일 삭제 (Rate Limit: 엄격)
export const DELETE = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const attachment = await prisma.sRAttachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundError('첨부파일');
    }

    // SR 접근 권한 체크
    const sr = await prisma.sR.findUnique({
      where: { id: attachment.srId },
    });

    if (!sr) {
      throw new NotFoundError('SR');
    }

    // 권한 체크: SR을 수정할 수 있는 권한이 있어야 첨부파일도 삭제 가능
    ensureCanUpdateSR(session.user, sr);

    // 파일 삭제 (Vercel Blob)
    const pathname =
      attachment.storagePath ??
      (attachment.fileUrl.startsWith('http') ? new URL(attachment.fileUrl).pathname.slice(1) : '');
    if (pathname) {
      await deleteAttachmentBlob(pathname);
    }

    // DB에서 삭제
    await prisma.sRAttachment.delete({
      where: { id },
    });

    // 활동 내역 추가
    await prisma.sRActivity.create({
      data: {
        srId: attachment.srId,
        userId: session.user.id,
        type: 'ATTACHMENT_REMOVED',
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

    return NextResponse.json({ message: '파일이 삭제되었습니다.' });
  },
  { preset: 'strict' }
); // 1분당 5회 (삭제는 민감한 작업)
