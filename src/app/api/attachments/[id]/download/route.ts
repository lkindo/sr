import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { Readable } from 'stream';

import { RouteContext } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { NotFoundError } from '@/lib/errors';
import { ensureCanReadSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { resolveAttachmentFilePath } from '@/lib/storage';

// 파일 시스템 접근이 필요하므로 Node.js 런타임
export const runtime = 'nodejs';

/**
 * 인라인 표시를 허용할 안전한 타입(이미지/PDF)만 inline, 그 외는 attachment 로 강제.
 * SVG/HTML 등은 앱 오리진에서 스크립트 실행(저장형 XSS) 위험이 있어 절대 inline 하지 않는다.
 */
function isInlineSafe(fileType: string): boolean {
  if (fileType === 'image/svg+xml') return false;
  return fileType.startsWith('image/') || fileType === 'application/pdf';
}

/**
 * GET /api/attachments/[id]/download - 인증된 첨부파일 다운로드 (Rate Limit: 표준)
 *
 * 보안(C4): 첨부파일은 웹루트(public) 밖에 저장되며, 이 라우트를 통해서만 접근 가능하다.
 * 호출자가 해당 SR을 조회할 수 있는 경우에만 파일을 스트리밍한다.
 */
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const attachment = await prisma.sRAttachment.findUnique({ where: { id } });
    if (!attachment) {
      throw new NotFoundError('첨부파일');
    }

    // 권한 체크: 첨부파일이 속한 SR을 조회할 수 있어야 함 (IDOR 방지)
    const sr = await prisma.sR.findUnique({ where: { id: attachment.srId } });
    if (!sr) {
      throw new NotFoundError('SR');
    }
    ensureCanReadSR(session.user, sr);

    // 신규(STORAGE_DIR)/레거시(public) 양쪽에서 안전하게 파일 경로 해석 (containment check 포함)
    const filePath = resolveAttachmentFilePath(attachment.storagePath ?? attachment.fileUrl);
    if (!filePath) {
      throw new NotFoundError('파일');
    }

    const stat = await fs.promises.stat(filePath);
    const fileType = attachment.fileType || 'application/octet-stream';
    const disposition = isInlineSafe(fileType) ? 'inline' : 'attachment';
    const encodedName = encodeURIComponent(attachment.fileName);

    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': fileType,
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
  { preset: 'standard' }
);
