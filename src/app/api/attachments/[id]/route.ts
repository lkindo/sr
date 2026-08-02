import { NextRequest, NextResponse } from 'next/server';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError } from '@/lib/errors';
import { ensureCanReadSR, ensureCanUpdateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { serializeResponse } from '@/lib/serialization';
import { deleteAttachmentBlob } from '@/lib/storage';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/attachments/[id] - 첨부파일 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
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

    // 권한 체크: 첨부파일이 속한 SR을 조회할 수 있어야 함 (IDOR 방지)
    const sr = await prisma.sR.findUnique({
      where: { id: attachment.srId },
    });
    if (!sr) {
      throw new NotFoundError('SR');
    }
    ensureCanReadSR(session.user, sr);

    // storagePath(내부 저장 경로)는 클라이언트에 노출하지 않음
    const { storagePath: _storagePath, ...safeAttachment } = attachment;

    // fileSize(BigInt) / createdAt(Date) 직렬화
    return NextResponse.json(serializeResponse(safeAttachment));
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

    const pathname =
      attachment.storagePath ??
      (attachment.fileUrl.startsWith('http') ? new URL(attachment.fileUrl).pathname.slice(1) : '');

    /**
     * 순서가 뒤집혀 있었다: 파일을 먼저 지우고 행을 지웠다(감사 4.2).
     * 그 사이에 실패하면 없는 파일을 가리키는 행이 남아 매 다운로드가 500 이 됐다.
     *
     * 이제 행 삭제와 활동 로그를 한 트랜잭션으로 커밋한 뒤 blob 을 지운다.
     * 이 순서에서 최악은 참조 없는 파일이 남는 것이고, 그건 사용자에게 보이지 않는다.
     */
    await prisma.$transaction(async (tx) => {
      await tx.sRAttachment.delete({ where: { id } });

      await tx.sRActivity.create({
        data: {
          srId: attachment.srId,
          userId: session.user.id,
          type: 'ATTACHMENT_REMOVED',
          description: `파일 삭제: ${attachment.fileName}`,
        },
      });
    });

    if (pathname) {
      await deleteAttachmentBlob(pathname).catch(() => {
        // 커밋은 끝났다. blob 정리 실패로 요청을 실패시키면 사용자가 이미 사라진 첨부를
        // 다시 지우려 시도하게 되므로, 여기서는 삼킨다.
      });
    }

    // 첨부 개수는 조회 시 _count 로 계산하므로 별도 스칼라 컬럼을 유지하지 않는다.

    return NextResponse.json({ message: '파일이 삭제되었습니다.' });
  },
  { preset: 'strict' }
); // 1분당 5회 (삭제는 민감한 작업)
